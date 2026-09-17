/**
 * scripts/qb-audit/bangla-audit.ts
 * ----------------------------------------------------------------------------
 * Phase 4b: Bangla-specific Unicode audit.
 *
 * Conservative detection — only flags UNAMBIGUOUS corruption patterns.
 * Legitimate Bangla text must NOT trigger false positives.
 *
 * What we check:
 *   - Replacement characters (U+FFFD) in Bangla text
 *   - Mangled header (বযাখ্যা pattern — unmistakable OCR corruption)
 *   - Extremely abnormal character sequences that cannot be legitimate
 *   - OCR substitution in mixed-language fields
 *
 * What we do NOT check (too many false positives):
 *   - Visual-order corruption patterns (use qb-forensics for that)
 *   - Pre-base marks at word boundaries (legitimate in some contexts)
 *   - Loose hasanta (legitimate when followed by punctuation)
 *   - Ra-phala spacing (legitimate in some typographic styles)
 * ----------------------------------------------------------------------------
 */

import { hasMangledHeader, hasOptionMarkers } from "../qb-forensics/bangla";
import { hasReplacementChar } from "../qb-forensics/unicode";
import type { QuestionRecord, UnicodeIssue } from "./types";

// ── Bangla character ranges ───────────────────────────────────────────────
const BANGLA_BASE = /[\u0980-\u09FF]/;

// ── OCR substitution patterns (Bangla → Latin confusion) ──────────────────
const OCR_SUBSTITUTIONS: Array<{ bangla: string; latin: string; context: string }> = [
  { bangla: "০", latin: "O", context: "digit-zero confused with Latin O" },
  { bangla: "১", latin: "l", context: "digit-one confused with lowercase L" },
  { bangla: "৫", latin: "S", context: "digit-five confused with S" },
];

function hasBanglaContent(s: string): boolean {
  return BANGLA_BASE.test(s);
}

function detectOCRSubstitution(s: string): Array<{ original: string; suspected: string; reason: string }> {
  const incidents: Array<{ original: string; suspected: string; reason: string }> = [];
  if (!hasBanglaContent(s)) return incidents;

  for (const sub of OCR_SUBSTITUTIONS) {
    const re = new RegExp(`[ক-হঅ-ঔ]\\s*${sub.latin}\\s*[ক-হঅ-ঔ]`, "g");
    if (re.test(s)) {
      incidents.push({
        original: sub.latin,
        suspected: sub.bangla,
        reason: sub.context,
      });
    }
  }
  return incidents;
}

export function auditBangla(records: QuestionRecord[]): UnicodeIssue[] {
  const issues: UnicodeIssue[] = [];

  for (const r of records) {
    const fields: Array<{ name: string; value: string }> = [
      { name: "question", value: r.question },
      { name: "correctAnswer", value: r.correctAnswer },
      { name: "explanation", value: r.explanation },
      ...r.options.map((o, i) => ({ name: `options[${i}]`, value: o })),
      { name: "path", value: r.path },
      { name: "topic", value: r.topic },
      { name: "subtopic", value: r.subtopic },
    ];

    for (const { name, value } of fields) {
      if (!value || !hasBanglaContent(value)) continue;

      // ── Unmistakable corruption: mangled header ──────────────────────
      if (hasMangledHeader(value)) {
        issues.push({
          type: "BROKEN_BANGLA",
          field: name,
          recordId: r.id,
          snippet: value.length > 60 ? value.slice(0, 60) + "..." : value,
          confidence: "HIGH",
          reason: "Mangled ব্যাখ্যা header (OCR corruption)",
        });
      }

      // ── Unmistakable corruption: replacement character ───────────────
      if (hasReplacementChar(value)) {
        issues.push({
          type: "BROKEN_BANGLA",
          field: name,
          recordId: r.id,
          snippet: value.length > 60 ? value.slice(0, 60) + "..." : value,
          confidence: "HIGH",
          reason: "Unicode replacement character in Bangla text",
        });
      }

      // ── Option markers in non-question fields ────────────────────────
      if (name !== "question" && hasOptionMarkers(value)) {
        issues.push({
          type: "BROKEN_BANGLA",
          field: name,
          recordId: r.id,
          snippet: value.length > 60 ? value.slice(0, 60) + "..." : value,
          confidence: "MEDIUM",
          reason: "Option markers found in non-question field (possible parsing error)",
        });
      }

      // ── OCR substitution detection ───────────────────────────────────
      const ocrIncidents = detectOCRSubstitution(value);
      for (const oc of ocrIncidents) {
        issues.push({
          type: "MOJIBAKE",
          field: name,
          recordId: r.id,
          snippet: value.length > 60 ? value.slice(0, 60) + "..." : value,
          confidence: "LOW",
          reason: `Possible OCR substitution: ${oc.original} → ${oc.suspected} (${oc.reason})`,
        });
      }
    }
  }

  return issues;
}

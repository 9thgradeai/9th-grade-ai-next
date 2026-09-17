/**
 * scripts/qb-audit/normalize.ts
 * ----------------------------------------------------------------------------
 * Phase 9: Deterministic normalization pipeline.
 *
 * Rules:
 *   - Deterministic: same input always produces same output
 *   - Idempotent: running twice produces same result as running once
 *   - Safe: only HIGH-confidence, meaning-preserving transforms
 *   - Reversible: every transform can be audited via change log
 *
 * Transform chain (in order):
 *   1. BOM strip
 *   2. Non-standard whitespace → U+0020
 *   3. Control character removal (except ZWJ/ZWNJ)
 *   4. Multi-space collapse
 *   5. Trim
 *   6. NFC normalization
 *   7. HTML entity decode (known-safe only)
 *   8. Literal escape decode (\\n, \\t)
 *   9. Bangla-specific normalization
 *  10. English-specific normalization
 * ----------------------------------------------------------------------------
 */

import { decodeHtmlEntities, decodeLiteralEscapes } from "../qb-forensics/unicode";
import type { NormalizedField, QuestionRecord } from "./types";

// ── Step 1: BOM strip ────────────────────────────────────────────────────
function stripBOM(s: string): string {
  return s.replace(/^\uFEFF/, "");
}

// ── Step 2: Non-standard whitespace ──────────────────────────────────────
const NON_STANDARD_SPACE = /[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027]/g;
function normalizeSpaces(s: string): string {
  return s.replace(NON_STANDARD_SPACE, " ");
}

// ── Step 3: Control characters (keep ZWJ/ZWNJ for Bangla) ────────────────
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2060\u00AD]/g;
function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS, "");
}

// ── Step 4-5: Multi-space collapse + trim ────────────────────────────────
function collapseAndTrim(s: string): string {
  return s.replace(/[ \t\r\f\v]{2,}/g, " ").trim();
}

// ── Step 6: NFC ──────────────────────────────────────────────────────────
function toNFC(s: string): string {
  return s.normalize("NFC");
}

// ── Step 7-8: Entity + escape decode ─────────────────────────────────────
function decodeEntities(s: string): string {
  const { out: afterHtml } = decodeHtmlEntities(s);
  const { out: afterEscape } = decodeLiteralEscapes(afterHtml);
  return afterEscape;
}

// ── Step 9: Bangla normalization ──────────────────────────────────────────
function normalizeBangla(s: string): string {
  // Remove spurious spaces before Bangla combining marks
  let out = s.replace(/\s(?=[ািীুূৃেৈোৌ্])/g, "");
  // Remove spurious spaces after Bangla hasanta
  out = out.replace(/্\s/g, "্");
  return out;
}

// ── Step 10: English normalization ────────────────────────────────────────
function normalizeEnglish(s: string): string {
  let out = s;
  // Normalize curly quotes to straight
  out = out.replace(/[\u2018\u2019\u201A]/g, "'");
  out = out.replace(/[\u201C\u201D\u201E]/g, '"');
  // Normalize dashes
  out = out.replace(/[\u2013\u2014]/g, "-");
  // Normalize ellipsis
  out = out.replace(/[\u2026]/g, "...");
  return out;
}

// ── Full pipeline ────────────────────────────────────────────────────────
export function normalizeField(value: string): NormalizedField {
  const original = value;
  const codes: string[] = [];

  let cur = value;

  const step = (code: string, fn: (s: string) => string) => {
    const next = fn(cur);
    if (next !== cur) {
      codes.push(code);
      cur = next;
    }
  };

  step("BOM", stripBOM);
  step("WHITESPACE", normalizeSpaces);
  step("CONTROL", stripControlChars);
  step("MULTI_SPACE", collapseAndTrim);
  step("NFC", toNFC);
  step("ENTITY", decodeEntities);
  step("BANGLA", normalizeBangla);
  step("ENGLISH", normalizeEnglish);

  // Final trim (entities/escapes may introduce trailing whitespace)
  cur = cur.trim();

  return {
    field: "",
    before: original,
    after: cur,
    codes,
    confidence: "HIGH",
  };
}

// ── Record-level normalization ────────────────────────────────────────────
export function normalizeRecord(r: QuestionRecord): NormalizedField[] {
  const fixes: NormalizedField[] = [];

  const fields: Array<{ name: keyof QuestionRecord; value: string }> = [
    { name: "question", value: r.question },
    { name: "correctAnswer", value: r.correctAnswer },
    { name: "explanation", value: r.explanation },
    ...r.options.map((o, i) => ({ name: `options[${i}]` as keyof QuestionRecord, value: o })),
  ];

  for (const { name, value } of fields) {
    if (!value) continue;
    const result = normalizeField(value);
    if (result.after !== value) {
      fixes.push({
        ...result,
        field: String(name),
      });
    }
  }

  return fixes;
}

/**
 * scripts/qb-audit/ocr-detect.ts
 * ----------------------------------------------------------------------------
 * Phase 6: OCR / PDF extraction damage detection.
 *
 * Detects suspicious character substitutions, broken word boundaries,
 * page headers/footers leaked into content, and other extraction artifacts.
 * ----------------------------------------------------------------------------
 */

import type { QuestionRecord } from "./types";

export interface OCRIncident {
  recordId: number;
  field: string;
  type:
    | "CHAR_SUBSTITUTION"
    | "PAGE_ARTIFACT"
    | "BROKEN_BOUNDARY"
    | "DUPLICATED_CHAR"
    | "RANDOM_PUNCTUATION"
    | "SOURCE_LEAK"
    | "QUESTION_NUMBER_LEAK";
  original: string;
  suspected: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
}

// ── Page header/footer patterns ──────────────────────────────────────────
const PAGE_ARTIFACTS = [
  /পৃষ্ঠা\s*\d+/,                          // "পৃষ্ঠা ১২" (Page 12)
  /Page\s+\d+/i,                            // "Page 12"
  /সরকারি\s+চাকরি/,                         // Government job header
  /বিসিএস\s+প্রিলিমিনারি/,                  // BCS Preliminary header
  /BCS\s+Preliminary/i,
  /প্রশ্ন\s*০*[০-৯0-9]+\s*[-–—]/,           // "প্রশ্ন ০১ —" (Question 01 —)
  /\d+\s*[-–]\s*\d+/,                        // Page range "12 — 13"
];

// ── Source reference leaks ───────────────────────────────────────────────
const SOURCE_LEAKS = [
  /উৎস:\s*/i,                               // "উৎস:" (Source:)
  /Source:\s*/i,
  /তথ্যসূত্র:\s*/i,
  /Reference:\s*/i,
  /www\.\S+/,                               // URLs
  /https?:\/\/\S+/,
  /©\s*\d{4}/,                              // Copyright notices
];

// ── Question number leaks into content ───────────────────────────────────
const QUESTION_NUMBER_LEAK = /^[০-৯0-9]+\.\s+[০-৯0-9]+\.|^[০-৯0-9]+\.\s*[০-৯0-9]+\s*[\.\)]/;

// ── Character duplication (OCR stutter) ──────────────────────────────────
function hasCharDuplication(s: string): boolean {
  return /(.)\1{3,}/.test(s); // 3+ consecutive identical characters
}

// ── Random punctuation clusters ──────────────────────────────────────────
function hasRandomPunctuation(s: string): boolean {
  return /[।,.;:!?]{4,}/.test(s) || /[.,;:!?]{5,}/.test(s);
}

// ── Broken word boundaries (Latin mixed into Bangla words) ───────────────
function hasBrokenBoundaries(s: string): boolean {
  // Bangla consonant followed immediately by Latin letter (not space)
  if (/[ক-হ][a-zA-Z]/.test(s)) return true;
  // Latin letter followed immediately by Bangla consonant
  if (/[a-zA-Z][ক-হ]/.test(s)) return true;
  return false;
}

export function detectOCR(records: QuestionRecord[]): OCRIncident[] {
  const incidents: OCRIncident[] = [];

  for (const r of records) {
    const fields: Array<{ name: string; value: string }> = [
      { name: "question", value: r.question },
      { name: "correctAnswer", value: r.correctAnswer },
      { name: "explanation", value: r.explanation },
      ...r.options.map((o, i) => ({ name: `options[${i}]`, value: o })),
    ];

    for (const { name, value } of fields) {
      if (!value) continue;

      // Page artifacts
      for (const pattern of PAGE_ARTIFACTS) {
        const match = value.match(pattern);
        if (match) {
          incidents.push({
            recordId: r.id,
            field: name,
            type: "PAGE_ARTIFACT",
            original: match[0],
            suspected: "",
            confidence: "MEDIUM",
            reason: `Page header/footer artifact detected: "${match[0]}"`,
          });
        }
      }

      // Source leaks
      for (const pattern of SOURCE_LEAKS) {
        const match = value.match(pattern);
        if (match) {
          incidents.push({
            recordId: r.id,
            field: name,
            type: "SOURCE_LEAK",
            original: match[0],
            suspected: "",
            confidence: "MEDIUM",
            reason: `Source reference leaked into content: "${match[0]}"`,
          });
        }
      }

      // Question number leaks
      if (name !== "question" && QUESTION_NUMBER_LEAK.test(value)) {
        incidents.push({
          recordId: r.id,
          field: name,
          type: "QUESTION_NUMBER_LEAK",
          original: value.slice(0, 30),
          suspected: "",
          confidence: "MEDIUM",
          reason: "Question number leaked into non-question field",
        });
      }

      // Character duplication
      if (hasCharDuplication(value)) {
        const match = value.match(/(.)\1{3,}/);
        incidents.push({
          recordId: r.id,
          field: name,
          type: "DUPLICATED_CHAR",
          original: match?.[0] ?? "",
          suspected: "",
          confidence: "LOW",
          reason: `Character duplicated ${match?.[0]?.length ?? 0} times (possible OCR stutter)`,
        });
      }

      // Random punctuation
      if (hasRandomPunctuation(value)) {
        incidents.push({
          recordId: r.id,
          field: name,
          type: "RANDOM_PUNCTUATION",
          original: value.slice(0, 40),
          suspected: "",
          confidence: "LOW",
          reason: "Excessive consecutive punctuation marks",
        });
      }

      // Broken word boundaries
      if (hasBrokenBoundaries(value)) {
        incidents.push({
          recordId: r.id,
          field: name,
          type: "BROKEN_BOUNDARY",
          original: value.slice(0, 60),
          suspected: "",
          confidence: "LOW",
          reason: "Suspicious Bangla-Latin character adjacency",
        });
      }
    }
  }

  return incidents;
}

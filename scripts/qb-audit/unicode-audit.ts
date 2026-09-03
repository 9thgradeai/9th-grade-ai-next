/**
 * scripts/qb-audit/unicode-audit.ts
 * ----------------------------------------------------------------------------
 * Phase 4: Deep Unicode audit across every relevant textual field.
 * Detects mojibake, replacement chars, control chars, non-standard spaces,
 * double encoding, broken sequences, and non-NFC text.
 * ----------------------------------------------------------------------------
 */

import { CONTROL_MASK, EXTRA_SPACE, REPLACEMENT_CHAR, hasReplacementChar, hasControlChars } from "../qb-forensics/unicode";
import type { QuestionRecord, UnicodeIssue } from "./types";

// ── Mojibake patterns (UTF-8 interpreted as Latin-1/Windows-1252) ──────────
const MOJIBAKE_PATTERNS = [
  /Ã[©¨ª°±²³µ¶·¸¹º»¼½¾¿À-ÿ]/,         // Latin-1 double-encode
  /â€[™"˜\u0093\u0094\u0098\u0099]/,      // Smart quotes/dashes
  /â€™/,                                    // Right single quote
  /â€œ/,                                    // Left double quote
  /â€\u009d/,                               // Right double quote
  /â€"/,                                    // Em dash
  /â€¦/,                                    // Ellipsis
  /[ÃÂ]{2,}/,                               // Repeated Latin-1 artifacts
  /Ð[°±²³µ¶·¸¹º»¼½¾Ñ-ÿ]/,                // Cyrillic double-encode
  /Ñ[‹›«»¿À-ÿ]/,                           // Cyrillic double-encode
  /\u00C3[\u0080-\u00BF]/,                  // Double-encoded UTF-8 lead byte
];

// ── Invalid Unicode sequences ─────────────────────────────────────────────
const INVALID_SEQUENCES = [
  /[\uFFFE\uFFFF]/,                         // Noncharacters
  /[\uFDD0-\uFDEF]/,                        // Noncharacters
  /[\u0080-\u009F]/,                        // C1 control characters (if literal)
];

function hasMojibake(s: string): boolean {
  return MOJIBAKE_PATTERNS.some((p) => p.test(s));
}

function hasInvalidSequences(s: string): boolean {
  return INVALID_SEQUENCES.some((p) => p.test(s));
}

function hasDoubleEncoding(s: string): boolean {
  // Check for UTF-8 bytes misinterpreted: e.g. \xC3\xA9 = é in UTF-8, but if
  // those bytes are interpreted as Latin-1 and re-encoded, you get Ã©
  return /\u00C3[\u0080-\u00BF]/.test(s) || /\u00C2[\u0080-\u00BF]/.test(s);
}

function hasNonNFC(s: string): boolean {
  return s.normalize("NFC") !== s;
}

function snippet(s: string, maxLen = 60): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

export function auditUnicode(records: QuestionRecord[]): UnicodeIssue[] {
  const issues: UnicodeIssue[] = [];

  for (const r of records) {
    const fields: Array<{ name: string; value: string }> = [
      { name: "question", value: r.question },
      { name: "correctAnswer", value: r.correctAnswer },
      { name: "explanation", value: r.explanation },
      ...r.options.map((o, i) => ({ name: `options[${i}]`, value: o })),
    ];

    for (const { name, value } of fields) {
      if (!value) continue;

      // Replacement character
      if (hasReplacementChar(value)) {
        issues.push({
          type: "REPLACEMENT_CHAR",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "HIGH",
          reason: `Field contains Unicode replacement character (U+FFFD)`,
        });
      }

      // Mojibake
      if (hasMojibake(value)) {
        issues.push({
          type: "MOJIBAKE",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "HIGH",
          reason: `Field contains mojibake pattern (UTF-8 double-encoded as Latin-1)`,
        });
      }

      // Double encoding
      if (hasDoubleEncoding(value)) {
        issues.push({
          type: "DOUBLE_ENCODING",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "HIGH",
          reason: `Field contains double-encoded UTF-8 bytes`,
        });
      }

      // Control characters (excluding ZWJ/ZWNJ which are legitimate in Bangla)
      if (hasControlChars(value)) {
        issues.push({
          type: "CONTROL_CHAR",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "MEDIUM",
          reason: `Field contains control/invisible characters`,
        });
      }

      // Non-standard spaces
      if (EXTRA_SPACE.test(value)) {
        issues.push({
          type: "NON_STANDARD_SPACE",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "HIGH",
          reason: `Field contains non-standard space characters (NBSP, etc.)`,
        });
        EXTRA_SPACE.lastIndex = 0; // Reset regex state
      }

      // Non-NFC
      if (hasNonNFC(value)) {
        issues.push({
          type: "NON_NFC",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "HIGH",
          reason: `Field is not in Unicode NFC normalization form`,
        });
      }

      // Invalid sequences
      if (hasInvalidSequences(value)) {
        issues.push({
          type: "INVALID_SEQUENCE",
          field: name,
          recordId: r.id,
          snippet: snippet(value),
          confidence: "MEDIUM",
          reason: `Field contains invalid Unicode sequences`,
        });
      }
    }
  }

  return issues;
}

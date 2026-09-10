/**
 * scripts/qb-forensics/import-gate.ts
 * ----------------------------------------------------------------------------
 * The shared import gate for the question bank. Every MCQ that enters the
 * database — new imports, reseeds, and the one-time cleanup sweep — must pass
 * this gate before it is allowed to become (or stay) a Question row.
 *
 * POLICY (single source of truth for "is this a usable MCQ?"):
 *
 *   1. FATAL — reject the record outright (verdict REJECT):
 *        • Unicode replacement characters, mojibake / double-encoded UTF-8,
 *          control/invisible characters, in ANY field
 *        • Broken Bangla: visual-order / cluster-split corruption
 *          (hasMangleSignature) or a mangled "ব্যাখ্যা" header
 *        • Option-markers leaking into OPTION text (multi-question scaffold)
 *        • Empty question / empty option / fewer than 4 options / empty answer
 *        • correctAnswer that matches no option (and is not a resolvable letter)
 *        • Empty EXPLANATION (question-bank policy: explanations are mandatory)
 *
 *   2. NON-FATAL — normalized automatically before import (verdict ACCEPT with
 *      `normalized` content): non-NFC composition, non-standard spaces, BOM,
 *      HTML entities / literal escapes. ZWJ/ZWNJ are preserved (legitimate in
 *      Bangla conjuncts).
 *
 *   3. DUPLICATES — a record whose normalized (question | correctAnswer |
 *      explanation) identity already exists anywhere in the database is a
 *      duplicate and must be skipped at import time (dupSignature()).
 *
 * This module is pure and side-effect free (no DB / I/O), so both the seeder
 * and the cleanup CLI share one code path and the test suite can verify it.
 * ----------------------------------------------------------------------------
 */

import {
  hasReplacementChar,
  hasControlChars,
  hasNonStandardSpace,
  decodeHtmlEntities,
  decodeLiteralEscapes,
  REPLACEMENT_CHAR,
} from "./unicode";
import { hasMangleSignature, hasMangledHeader, hasOptionMarkers } from "./bangla";
import { applyTransforms, resolveLetterAnswer } from "./classify";

export type GateField = "question" | "options" | "correctAnswer" | "explanation" | "record";

export type GateIssueCode =
  | "REPLACEMENT_CHAR"
  | "MOJIBAKE"
  | "DOUBLE_ENCODING"
  | "CONTROL_CHAR"
  | "VISUAL_ORDER_BANGLA"
  | "MANGLED_HEADER"
  | "OPTION_MARKER_LEAK"
  | "EMPTY_QUESTION"
  | "EMPTY_OPTION"
  | "WRONG_OPTION_COUNT"
  | "EMPTY_ANSWER"
  | "ANSWER_MISMATCH"
  | "EMPTY_EXPLANATION"
  | "NON_NFC"
  | "NON_STANDARD_SPACE";

export interface GateIssue {
  code: GateIssueCode;
  field: GateField;
  fatal: boolean;
  detail: string;
  snippet?: string;
}

export interface McaInput {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export type GateVerdict = "ACCEPT" | "REJECT";

export interface McaGateResult {
  verdict: GateVerdict;
  /** Every diagnosed issue (fatal + non-fatal warnings). */
  issues: GateIssue[];
  /** Only the issues that caused REJECT. Empty when ACCEPT. */
  fatal: GateIssue[];
  /** Fully normalized content (NFC / spaces / entities) — use this for import. */
  normalized: McaInput;
}

// ── Mojibake / double-encoding detection ───────────────────────────────────
// UTF-8 text that was interpreted as Latin-1/Windows-1252 and re-encoded.
const MOJIBAKE_PATTERNS = [
  /Ã[©¨ª°±²³µ¶·¸¹º»¼½¾¿À-ÿ]/,
  /â€[™"˜\u0093\u0094\u0098\u0099]/,
  /â€™/,
  /â€œ/,
  /â€\u009d/,
  /â€"/,
  /â€¦/,
  /[ÃÂ]{2,}/,
  /Ð[°±²³µ¶·¸¹º»¼½¾Ñ-ÿ]/,
  /Ñ[‹›«»¿À-ÿ]/,
  /\u00C3[\u0080-\u00BF]/,
];
const DOUBLE_ENCODING = /\u00C3[\u0080-\u00BF]|\u00C2[\u0080-\u00BF]/;

function hasMojibake(s: string): boolean {
  return MOJIBAKE_PATTERNS.some((p) => p.test(s));
}

function snippet(s: string, maxLen = 90): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "…";
}

function fieldLabel(field: GateField, index?: number): string {
  if (field === "options") return `options[${index ?? 0}]`;
  return field;
}

interface FieldIssue {
  issues: GateIssue[];
}

/** Deterministic content normalization for one text field (keeps ZWJ/ZWNJ). */
export function normalizeField(s: string): string {
  return applyTransforms(s).value;
}

/**
 * Normalize an entire MCQ record. Pure; mirrors the wording used at import:
 * fields are normalized individually so null/legit-empty inputs survive.
 */
export function normalizeMca(rec: McaInput): McaInput {
  return {
    question: normalizeField(rec.question ?? ""),
    options: (rec.options ?? []).map((o) => normalizeField(o ?? "")),
    correctAnswer: normalizeField(rec.correctAnswer ?? ""),
    explanation: normalizeField(rec.explanation ?? ""),
  };
}

/**
 * Scan one MCQ against the import gate. Pure and side-effect free.
 *
 * REJECT means the record must not be imported (broken Unicode, broken
 * structure, or missing mandatory explanation). ACCEPT means it may be
 * imported using `result.normalized` content.
 */
export function scanMca(raw: McaInput): McaGateResult {
  const rec: McaInput = {
    question: raw.question ?? "",
    options: Array.isArray(raw.options) ? raw.options : [],
    correctAnswer: raw.correctAnswer ?? "",
    explanation: raw.explanation ?? "",
  };
  const issues: GateIssue[] = [];
  const fatal: GateIssue[] = [];
  const push = (i: GateIssue) => {
    issues.push(i);
    if (i.fatal) fatal.push(i);
  };

  // ── 1. Unicode health gate on every text field ──────────────────────────
  // Corruption checks run against the FULLY NORMALIZED field value (BOM /
  // weird spaces / composition already applied). A leading BOM or NBSP is a
  // harmless file artifact — normalized away, never a reason to reject a
  // salvageable MCQ. Real control chars (C0/C1, ZWSP U+200B, soft hyphen)
  // survive normalization and are still caught as fatal.
  const norm = normalizeMca(rec);
  const textFields: Array<{ field: GateField; value: string; index?: number }> = [
    { field: "question", value: rec.question },
    { field: "correctAnswer", value: rec.correctAnswer },
    { field: "explanation", value: rec.explanation },
    ...rec.options.map((o, i) => ({ field: "options" as GateField, value: o, index: i })),
  ];

  for (const { field, value, index } of textFields) {
    if (!value) continue;
    const normValue = normalizeField(value);
    if (hasReplacementChar(value)) {
      push({
        code: "REPLACEMENT_CHAR",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} contains Unicode replacement character (${REPLACEMENT_CHAR})`,
        snippet: snippet(value),
      });
    }
    if (hasMojibake(normValue)) {
      push({
        code: "MOJIBAKE",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} contains mojibake (UTF-8 double-encoded as Latin-1)`,
        snippet: snippet(value),
      });
    } else if (DOUBLE_ENCODING.test(normValue)) {
      push({
        code: "DOUBLE_ENCODING",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} contains double-encoded UTF-8 bytes`,
        snippet: snippet(value),
      });
    }
    if (hasControlChars(normValue)) {
      push({
        code: "CONTROL_CHAR",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} contains control/invisible characters`,
        snippet: snippet(value),
      });
    }
    if (hasMangleSignature(normValue)) {
      push({
        code: "VISUAL_ORDER_BANGLA",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} shows visual-order / cluster-split Bangla corruption`,
        snippet: snippet(value),
      });
    }
    if (hasMangledHeader(normValue)) {
      push({
        code: "MANGLED_HEADER",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} contains a mangled "ব্যাখ্যা" header`,
        snippet: snippet(value),
      });
    }
    if (value.normalize("NFC") !== value) {
      push({
        code: "NON_NFC",
        field,
        fatal: false,
        detail: `${fieldLabel(field, index)} is not NFC-normalized (will be composed)`,
      });
    }
    if (hasNonStandardSpace(value)) {
      push({
        code: "NON_STANDARD_SPACE",
        field,
        fatal: false,
        detail: `${fieldLabel(field, index)} contains non-standard space characters (will be normalized)`,
      });
    }
  }

  // Option-markers leaking into option text = multi-question scaffold bleed.
  for (let i = 0; i < norm.options.length; i++) {
    if (norm.options[i] && hasOptionMarkers(norm.options[i])) {
      push({
        code: "OPTION_MARKER_LEAK",
        field: "options",
        fatal: true,
        detail: `options[${i}] contains option markers (scaffold leak into a single option)`,
        snippet: snippet(rec.options[i]),
      });
    }
  }

  // ── 2. Structural gate ──────────────────────────────────────────────────
  const nq = norm.question;
  const nOpts = norm.options;
  const na = norm.correctAnswer;
  const ne = norm.explanation;

  if (!nq) {
    push({ code: "EMPTY_QUESTION", field: "question", fatal: true, detail: "Question text is empty" });
  }
  if (nOpts.length < 4) {
    push({
      code: "WRONG_OPTION_COUNT",
      field: "options",
      fatal: true,
      detail: `expected 4 options, found ${nOpts.length}`,
    });
  }
  if (nOpts.some((o) => !o)) {
    push({ code: "EMPTY_OPTION", field: "options", fatal: true, detail: "One or more options are empty" });
  }
  if (!na) {
    push({ code: "EMPTY_ANSWER", field: "correctAnswer", fatal: true, detail: "Correct answer is empty" });
  }
  if (!ne) {
    push({ code: "EMPTY_EXPLANATION", field: "explanation", fatal: true, detail: "Explanation is mandatory for every MCQ" });
  }

  // Answer must resolve to one of the options (exact normalized match, or a
  // letter whose remainder matches its option). Never guessed.
  if (na && nOpts.length >= 2) {
    const direct = nOpts.findIndex((o) => o === na);
    if (direct === -1) {
      const res = resolveLetterAnswer(na);
      const matches = res !== null && res.index < nOpts.length && (res.rest === "" || res.rest === nOpts[res.index]);
      if (!matches) {
        push({
          code: "ANSWER_MISMATCH",
          field: "correctAnswer",
          fatal: true,
          detail: `correctAnswer "${snippet(na, 40)}" does not match any option (and is not a resolvable letter)`,
        });
      }
    }
  }

  return { verdict: fatal.length > 0 ? "REJECT" : "ACCEPT", issues, fatal, normalized: norm };
}

/**
 * Identity signature for duplicate detection: normalized question + correct
 * answer + explanation. Records sharing this signature are the same MCQ —
 * Unicode composition, whitespace, case, and punctuation differences collapse.
 */
export function dupSignature(question: string, correctAnswer: string, explanation: string): string {
  const norm = (s: string) =>
    normalizeField(s)
      .toLowerCase()
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, "")
      .replace(/[^\p{L}\p{N}\u0980-\u09FF]+/gu, " ")
      .trim();
  return [norm(question), norm(correctAnswer), norm(explanation)].join("|");
}

/** Signature of a full record (same as dupSignature with its fields). */
export function mcaSignature(rec: McaInput): string {
  return dupSignature(rec.question, rec.correctAnswer, rec.explanation);
}

/** Convenience: true when any text field is fatally corrupt. */
export function isCorrupt(rec: McaInput): boolean {
  return scanMca(rec).fatal.some((i) =>
    ["REPLACEMENT_CHAR", "MOJIBAKE", "DOUBLE_ENCODING", "CONTROL_CHAR", "VISUAL_ORDER_BANGLA", "MANGLED_HEADER", "OPTION_MARKER_LEAK"].includes(i.code),
  );
}
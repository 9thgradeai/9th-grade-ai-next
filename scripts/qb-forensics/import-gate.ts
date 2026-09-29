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
 *        • Math that still cannot render AFTER canonical normalization:
 *          literal LaTeX outside math (MATH_LITERAL_LATEX), garbled unbalanced
 *          `$` around attempted LaTeX (MATH_UNBALANCED_DOLLAR), or a span
 *          KaTeX rejects (MATH_KATEX_ERROR). Odd `$` with no LaTeX evidence
 *          is a currency/keyboard dollar — non-fatal warning only.
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
import {
  hasMangleSignature,
  hasMangledHeader,
  hasOptionMarkers,
  hasQuestionScaffold,
  hasForeignIndicScript,
} from "./bangla";
import { applyTransforms, resolveLetterAnswer } from "./classify";
import katex from "katex";
import {
  normalizeMathContent,
  validateMathContent,
  splitLatexBraced,
} from "../../frontend/lib/math/canonical-math";

export type GateField = "question" | "options" | "correctAnswer" | "explanation" | "statements" | "record";

export type GateIssueCode =
  | "REPLACEMENT_CHAR"
  | "MOJIBAKE"
  | "DOUBLE_ENCODING"
  | "CONTROL_CHAR"
  | "VISUAL_ORDER_BANGLA"
  | "FOREIGN_SCRIPT"
  | "MANGLED_HEADER"
  | "OPTION_MARKER_LEAK"
  | "QUESTION_SCAFFOLD"
  | "QUESTION_HEADER_LEAK"
  | "EXPLANATION_SCAFFOLD"
  | "DUPLICATE_OPTION"
  | "EMPTY_QUESTION"
  | "EMPTY_OPTION"
  | "WRONG_OPTION_COUNT"
  | "EMPTY_ANSWER"
  | "ANSWER_MISMATCH"
  | "EMPTY_EXPLANATION"
  | "BAD_QUESTION_TYPE"
  | "MULTI_TOO_FEW_ANSWERS"
  | "ANSWER_NOT_IN_OPTIONS"
  | "STATEMENT_TOO_FEW"
  | "NON_NFC"
  | "NON_STANDARD_SPACE"
  // Math rendering (FATAL — canonical pipeline could not make it render):
  | "MATH_LITERAL_LATEX"
  | "MATH_UNBALANCED_DOLLAR"
  | "MATH_KATEX_ERROR";

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
  correctAnswer?: string;
  explanation: string;
  /** Optional multi-type fields — absent = legacy SINGLE_CHOICE. */
  questionType?: string;
  correctAnswers?: string[];
  statements?: string[];
}

/** McaInput with guaranteed normalized fields (all arrays non-optional). */
export interface NormalizedMca extends McaInput {
  questionType: string;
  correctAnswers: string[];
  statements: string[];
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

/** Parse every `$...$`/`$$...$$` span with KaTeX; first error message or null. */
function katexError(s: string): string | null {
  const re = /\$\$([\s\S]*?)\$\$|\$([^$\n]*?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const body = m[1] ?? m[2] ?? "";
    if (!body.trim()) continue;
    try {
      katex.renderToString(body, { throwOnError: true, strict: false });
    } catch (e) {
      return String((e as Error).message).replace(/\s+/g, " ").slice(0, 110);
    }
  }
  return null;
}

/** Attempted-but-broken LaTeX: commands / radicals / scripts anywhere in the field. */
function latexEvidence(s: string): boolean {
  return /\\(?:[a-zA-Z]+|%)|√|\^\{|_\{/.test(s);
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
 * Strip a leading question-number scaffold ("Question 164.", "Q.12:", "প্রশ্ন
 * ১৬৪।") from question TEXT. The Practice UI already renders its own counter,
 * so the scaffold must never live in the stored text. Only an explicit
 * leading marker is removed — in-body numbers and bare leading digits (e.g.
 * "10110 বাইনারি…") are left untouched.
 */
export function stripQuestionScaffold(s: string): string {
  return s.replace(
    /^\s*(question|ques\.?|q\.?|প্রশ্ন)\s*(no\.?|নং|নম্বর|number)?\s*[0-9০-৯]+\s*[.\-:;)।]?\s*/i,
    "",
  );
}

/**
 * Normalize an entire MCQ record. Pure; mirrors the wording used at import:
 * fields are normalized individually so null/legit-empty inputs survive.
 */
export function normalizeMca(rec: McaInput): NormalizedMca {
  const qt = rec.questionType ?? "SINGLE_CHOICE";
  // Canonical math pass: unicode math / LaTeX artifacts are repaired here so
  // `normalized` is exactly what must render. Idempotent.
  const m = (field: string, s: string) => normalizeMathContent(s, { field }).output;
  const result: NormalizedMca = {
    ...rec,
    questionType: qt,
    question: m("question", stripQuestionScaffold(normalizeField(rec.question ?? ""))),
    options: (rec.options ?? []).map((o, i) => m(`options[${i}]`, normalizeField(o ?? ""))),
    correctAnswer: m("correctAnswer", normalizeField(rec.correctAnswer ?? "")),
    explanation: m("explanation", normalizeField(rec.explanation ?? "")),
    correctAnswers: rec.correctAnswers?.map((c, i) => m(`correctAnswers[${i}]`, normalizeField(c))) ?? [],
    statements: rec.statements?.map((s, i) => m(`statements[${i}]`, normalizeField(s ?? ""))) ?? [],
  };
    if (qt === "SINGLE_CHOICE" && result.correctAnswers.length === 0 && rec.correctAnswer) {
     result.correctAnswers = [normalizeField(rec.correctAnswer)];
   }
  return result;
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
    questionType: raw.questionType ?? "SINGLE_CHOICE",
    correctAnswers: Array.isArray(raw.correctAnswers) ? raw.correctAnswers : [],
    statements: Array.isArray(raw.statements) ? raw.statements : [],
  };
  const issues: GateIssue[] = [];
  const fatal: GateIssue[] = [];
  const push = (i: GateIssue) => {
    issues.push(i);
    if (i.fatal) fatal.push(i);
  };

  const norm: NormalizedMca = normalizeMca(rec);
   const textFields: Array<{ field: GateField; value: string; index?: number }> = [
     { field: "question", value: rec.question },
     { field: "correctAnswer", value: rec.correctAnswer ?? "" },
     { field: "explanation", value: rec.explanation },
    ...rec.options.map((o, i) => ({ field: "options" as GateField, value: o, index: i })),
    ...(norm.statements ?? []).map((s, i) => ({ field: "statements" as GateField, value: s, index: i })),
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
    if (hasForeignIndicScript(normValue)) {
      push({
        code: "FOREIGN_SCRIPT",
        field,
        fatal: true,
        detail: `${fieldLabel(field, index)} contains a glyph from a sibling Indic script (Devanagari/Gurmukhi/Tamil/etc. OCR glyph-substitution)`,
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

  // ── Math gate (post-canonical) ────────────────────────────────────────────
  // After normalizeMca's canonical pass the stored text must actually render:
  //   • literal LaTeX left outside math          → MATH_LITERAL_LATEX (fatal)
  //   • unbalanced `$` around attempted LaTeX     → MATH_UNBALANCED_DOLLAR (fatal;
  //     odd `$` without LaTeX evidence is a currency/keyboard `$` → non-fatal)
  //   • a span KaTeX cannot parse                 → MATH_KATEX_ERROR (fatal)
  const mathFields: Array<{ field: GateField; value: string; index?: number }> = [
    { field: "question", value: norm.question },
    { field: "correctAnswer", value: norm.correctAnswer ?? "" },
    { field: "explanation", value: norm.explanation },
    ...norm.options.map((o, i) => ({ field: "options" as GateField, value: o, index: i })),
    ...norm.statements.map((s, i) => ({ field: "statements" as GateField, value: s, index: i })),
  ];
  for (const { field, value, index } of mathFields) {
    if (!value) continue;
    const label = fieldLabel(field, index);
    const mathOut = normalizeMathContent(value, { field: label }).output;
    const v = validateMathContent(mathOut, label);
    if (v.errors.some((e) => e.type === "RAW_UNICODE_MATH" || e.type === "RAW_LOG_SUBSCRIPT")
      || splitLatexBraced(mathOut).some((p) => !p.latex && /\\(?:[a-zA-Z]+|%)/.test(p.text))) {
      push({
        code: "MATH_LITERAL_LATEX",
        field,
        fatal: true,
        detail: `${label} still contains literal LaTeX outside math after canonical normalization`,
        snippet: snippet(value),
      });
    }
    if (v.errors.some((e) => e.type === "UNBALANCED_DOLLAR")) {
      push({
        code: "MATH_UNBALANCED_DOLLAR",
        field,
        fatal: latexEvidence(mathOut),
        detail: latexEvidence(mathOut)
          ? `${label} has unbalanced $ around attempted LaTeX (garbled span)`
          : `${label} has an odd $ count (likely currency/keyboard — review only)`,
        snippet: snippet(value),
      });
    }
    const kErr = katexError(mathOut);
    if (kErr !== null) {
      push({
        code: "MATH_KATEX_ERROR",
        field,
        fatal: true,
        detail: `${label} contains a span KaTeX cannot parse: ${kErr}`,
        snippet: snippet(value),
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

  // A multi-MCQ scaffold welded into the QUESTION text (option markers, a
  // second answer key, or a source watermark) = concatenated / OCR-page bleed.
  if (norm.question && hasQuestionScaffold(norm.question)) {
    push({
      code: "QUESTION_SCAFFOLD",
      field: "question",
      fatal: true,
      detail: "Question text contains a concatenated MCQ scaffold (embedded option markers / answer key / source watermark)",
      snippet: snippet(norm.question),
    });
  }

  // Question field that begins with a stray "ব্যাখ্যা:" header — the previous
  // row's explanation marker shifted into this row's question (scaffold shift).
  if (norm.question && /^\s*ব্যাখ্যা\s*[:;ঃ]/.test(norm.question)) {
    push({
      code: "QUESTION_HEADER_LEAK",
      field: "question",
      fatal: true,
      detail: 'question starts with a stray "ব্যাখ্যা:" header — scaffold shift from an adjacent row',
      snippet: snippet(norm.question),
    });
  }

  // An explanation carrying option markers (ক)(খ)(গ)(ঘ) means a SECOND question's
  // scaffold (its question + option block) spilled into this row's explanation.
  if (norm.explanation && hasOptionMarkers(norm.explanation)) {
    push({
      code: "EXPLANATION_SCAFFOLD",
      field: "explanation",
      fatal: true,
      detail: "Explanation contains option markers from a different question (concatenated / scaffold-shifted row)",
      snippet: snippet(norm.explanation),
    });
  }

   // ── 2. Structural gate ──────────────────────────────────────────────────
   const nq = norm.question;
   const nOpts = norm.options;
   const na = norm.correctAnswer;
   const ne = norm.explanation;
   const correctSet = norm.correctAnswers && norm.correctAnswers.length > 0
     ? [...norm.correctAnswers]
     : (na ? [na] : []);

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
  // Duplicate option values within one MCQ (e.g. A and C both "১৯৭৮") make the
  // question unanswerable — two options collapse onto a single correct answer.
  const normOption = (o: string) => o.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  if (nOpts.length >= 2) {
    const seen = new Set<string>();
    for (const o of nOpts) {
      const key = normOption(o);
      if (!key) continue; // empties already handled by EMPTY_OPTION
      if (seen.has(key)) {
        push({
          code: "DUPLICATE_OPTION",
          field: "options",
          fatal: true,
          detail: `options contain a duplicate value: "${snippet(o, 40)}"`,
          snippet: snippet(o),
        });
        break;
      }
      seen.add(key);
    }
  }
    if (!na && correctSet.length === 0) {
      push({ code: "EMPTY_ANSWER", field: "correctAnswer", fatal: true, detail: "Correct answer is empty" });
    }
   if (!ne) {
     push({ code: "EMPTY_EXPLANATION", field: "explanation", fatal: true, detail: "Explanation is mandatory for every MCQ" });
   }

   // ── 3. Type-field gate ──────────────────────────────────────────────
   const qt = norm.questionType as string;
   const validTypes = ["SINGLE_CHOICE", "MULTI_CHOICE", "STATEMENT_COMBINATION", "MEDIA_ATTACHMENT"];
   if (qt && !validTypes.includes(qt)) {
     push({
       code: "BAD_QUESTION_TYPE",
       field: "record",
       fatal: true,
       detail: `questionType "${qt}" is not one of: ${validTypes.join(", ")}`,
     });
   }
    if (qt === "MULTI_CHOICE") {
     if (correctSet.length < 2) {
        push({ code: "MULTI_TOO_FEW_ANSWERS", field: "correctAnswer", fatal: true, detail: "MULTI_CHOICE requires at least 2 correct answers" });
      }
      for (const ca of correctSet) {
        if (ca && !nOpts.includes(ca)) {
          push({ code: "ANSWER_NOT_IN_OPTIONS", field: "correctAnswer", fatal: true, detail: `correctAnswer "${snippet(ca, 40)}" is not one of the options` });
        }
      }
   }
   if (qt === "STATEMENT_COMBINATION") {
      if (norm.statements.length < 2) {
       push({ code: "STATEMENT_TOO_FEW", field: "statements", fatal: true, detail: "STATEMENT_COMBINATION requires at least 2 statements" });
     }
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

/** Signature of a full record — uses correctAnswers when present (multi-type), else correctAnswer. */
export function mcaSignature(rec: McaInput): string {
  const norm = normalizeMca(rec);
  const correctKey = norm.correctAnswers && norm.correctAnswers.length > 0
     ? [...norm.correctAnswers].sort().join("‖")
     : norm.correctAnswer ?? "";
   return dupSignature(norm.question, correctKey, norm.explanation);
}

/** Convenience: true when any text field is fatally corrupt. */
export function isCorrupt(rec: McaInput): boolean {
  return scanMca(rec).fatal.some((i) =>
    ["REPLACEMENT_CHAR", "MOJIBAKE", "DOUBLE_ENCODING", "CONTROL_CHAR", "VISUAL_ORDER_BANGLA", "FOREIGN_SCRIPT", "MANGLED_HEADER", "OPTION_MARKER_LEAK", "QUESTION_SCAFFOLD", "QUESTION_HEADER_LEAK", "EXPLANATION_SCAFFOLD", "BAD_QUESTION_TYPE", "MULTI_TOO_FEW_ANSWERS", "ANSWER_NOT_IN_OPTIONS", "STATEMENT_TOO_FEW", "MATH_LITERAL_LATEX", "MATH_UNBALANCED_DOLLAR", "MATH_KATEX_ERROR"].includes(i.code),
  );
}
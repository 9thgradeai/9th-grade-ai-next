/**
 * scripts/qb-forensics/classify.ts
 * ----------------------------------------------------------------------------
 * Classifies a Question record: detects anomalies, decides VERDICT
 * (AUTO vs REVIEW) and produces either deterministic fixes (AUTO) or
 * reconstruction candidates for humans (REVIEW).
 *
 * RULES OF THE ROAD (matching the phase spec):
 *   - AUTO  = only deterministic, meaning-preserving, invariant-under-reseed
 *             changes (Unicode normalization + whitespace + mechanical
 *             escape/entity decoding + provable answer↔option alignment).
 *   - REVIEW = any record whose *content* (question/options/answer/explanation
 *             or path) shows the visual-order / mis-parse corruption. Those
 *             rows are never auto-rewritten; they go to review-required.
 *   - A whole record goes to REVIEW the moment ANY content field is mangled.
 * ----------------------------------------------------------------------------
 */

import type { ClassifiedRecord, QuestionRecord, ReviewCandidate, FieldChange, Confidence } from "./issues";
import {
  hasReplacementChar,
  hasControlChars,
  decodeHtmlEntities,
  decodeLiteralEscapes,
} from "./unicode";
import { hasMangleSignature, hasMangledHeader, hasOptionMarkers, deshapeCandidate } from "./bangla";

const LETTER_INDEX: Record<string, number> = {
  ক: 0,
  খ: 1,
  গ: 2,
  ঘ: 3,
  ঙ: 4,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
};

/** Resolve "গ। ১৩টি", "(খ) রুপসী", "C. Frank" -> option index + remainder. */
export function resolveLetterAnswer(answer: string): { index: number; rest: string } | null {
  let m = answer.match(/^\((ক|খ|গ|ঘ|ঙ)\)/);
  if (m) return { index: LETTER_INDEX[m[1]], rest: answer.slice(m[0].length).replace(/^[।.\s]+/, "") };
  m = answer.match(/^[কখগঘঙ][।.]:?\s*/);
  if (m && answer.length > m[0].length) {
    return { index: LETTER_INDEX[answer[0]], rest: answer.slice(m[0].length).replace(/^[।.\s]+/, "") };
  }
  const lat = answer.match(/^\(?([A-Da-d])\)?[.]:?\s*/);
  if (lat) return { index: LETTER_INDEX[lat[1].toLowerCase()], rest: answer.slice(lat[0].length).trim() };
  return null;
}

function fieldMangled(s: string): boolean {
  if (!s) return false;
  return hasMangleSignature(s) || hasMangledHeader(s) || hasReplacementChar(s);
}

/** Deterministic normalized value for a text field; keeps ZWJ/ZWNJ. */
function detNormalize(s: string): string {
  return applyTransforms(s).value;
}

interface TransformChain {
  code: string;
  apply: (s: string) => string;
}

const TRANSFORMS: TransformChain[] = [
  { code: "BOM", apply: (s) => s.replace(/^\uFEFF/, "") },
  { code: "WS_NON_STANDARD", apply: (s) => s.replace(/[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027]/g, " ") },
  { code: "WS_MULTI+TRIM", apply: (s) => s.replace(/[ \t\r\f\v]{2,}/g, " ").trim() },
  { code: "NFC", apply: (s) => s.normalize("NFC") },
  { code: "HTML_ENTITY", apply: (s) => decodeHtmlEntities(s).out },
  { code: "LITERAL_ESCAPE", apply: (s) => decodeLiteralEscapes(s).out },
];

export function applyTransforms(s: string): { value: string; applied: string[]; fromEach: string[] } {
  let cur = s;
  const applied: string[] = [];
  const fromEach: string[] = [s];
  for (const t of TRANSFORMS) {
    const before = cur;
    cur = t.apply(cur);
    if (cur !== before) applied.push(t.code);
    fromEach.push(cur);
  }
  return { value: cur, applied, fromEach };
}

export function classifyRecord(r: QuestionRecord): ClassifiedRecord {
  const fixes: FieldChange[] = [];
  const candidates: ReviewCandidate[] = [];
  const reviewReasons: string[] = [];
  let verdict: "AUTO" | "REVIEW" = "AUTO";

  // ---------------------------------------------------------------------------
  // 1. Whole-record corruption gate (visual order / misparse / mojibake)
  // ---------------------------------------------------------------------------
  const textFields: Array<{ field: "question" | "correctAnswer" | "explanation"; v: string }> = [
    { field: "question", v: r.question },
    { field: "correctAnswer", v: r.correctAnswer },
    { field: "explanation", v: r.explanation },
  ];

  for (const { field, v } of textFields) {
    if (fieldMangled(v)) {
      reviewReasons.push(`${field}: visual-order / mis-parse corruption`);
      candidates.push({
        field,
        code: "VISUAL_ORDER_BANGLA",
        from: v,
        candidate: deshapeCandidate(v),
        confidence: "MEDIUM",
        rationale:
          "Reconstructed logical-order text. MUST be checked against the source PDF / the clean extract in bcs_p6_out.txt before saving; the transform is ambiguous in places.",
      });
    }
  }

  const mangledOptions = r.options.some((o) => fieldMangled(o) || hasOptionMarkers(o));
  if (mangledOptions) {
    reviewReasons.push("options: visual-order / mis-parse corruption");
    candidates.push({
      field: "options",
      code: "VISUAL_ORDER_BANGLA",
      from: JSON.stringify(r.options),
      candidate: JSON.stringify(r.options.map((o) => deshapeCandidate(o))),
      confidence: "MEDIUM",
      rationale: "Reconstructed logical-order options. Verify against the source before using.",
    });
  }

  if (r.path && (hasMangleSignature(r.path) || hasMangledHeader(r.path))) {
    reviewReasons.push("path: visual-order corruption in taxonomy string");
  }
  if (r.topic && (hasMangleSignature(r.topic) || hasMangledHeader(r.topic))) {
    reviewReasons.push("topic: visual-order corruption in taxonomy string");
  }
  if (r.subtopic && (hasMangleSignature(r.subtopic) || hasMangledHeader(r.subtopic))) {
    reviewReasons.push("subtopic: visual-order corruption in taxonomy string");
  }

  if (reviewReasons.length > 0) {
    verdict = "REVIEW";
    return { ...r, verdict, reviewReasons, fixes, candidates };
  }

  // ---------------------------------------------------------------------------
  // 2. Deterministic Unicode / whitespace normalization (HIGH, clean records)
  // ---------------------------------------------------------------------------
  for (const { field, v } of textFields) {
    const { value, applied } = applyTransforms(v);
    if (value !== v) {
      fixes.push({
        field,
        code: applied.join("+"),
        from: v,
        to: value,
        confidence: "HIGH",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Options + answer invariants (clean records only)
  // ---------------------------------------------------------------------------
  const normOptions = r.options.map((o) => detNormalize(o));
  const optsChanged = normOptions.some((o, i) => o !== r.options[i]);

  if (normOptions.length !== 4) {
    reviewReasons.push(`options: expected 4 options, found ${normOptions.length}`);
  }
  if (normOptions.some((o) => o === "")) {
    reviewReasons.push("options: contains an empty option");
  }

  {
    const seen = new Map<string, number>();
    for (let i = 0; i < normOptions.length; i++) {
      const o = normOptions[i];
      if (o === "") continue;
      if (seen.has(o)) {
        reviewReasons.push(`options: duplicates at index ${seen.get(o)} and ${i} ("${o.slice(0, 24)}")`);
        break;
      }
      seen.set(o, i);
    }
  }

  const structureOK =
    normOptions.length === 4 &&
    !normOptions.some((o) => o === "") &&
    new Set(normOptions).size === normOptions.length;
  if (structureOK) {
    const ansNorm = detNormalize(r.correctAnswer);
    const idx = normOptions.findIndex((o) => o === ansNorm);
    if (idx === -1) {
      const res = resolveLetterAnswer(ansNorm);
      if (res && res.index < normOptions.length) {
        const rest = res.rest;
        if (rest === "" || rest === normOptions[res.index]) {
          fixes.push({
            field: "correctAnswer",
            code: "ANSWER_LETTER_RESOLVED",
            from: r.correctAnswer,
            to: normOptions[res.index],
            confidence: "HIGH",
          });
        } else {
          reviewReasons.push(`correctAnswer: letter resolves to option ${res.index} but text "${rest.slice(0, 30)}" does not match it`);
        }
      } else if (ansNorm !== "") {
        reviewReasons.push(`correctAnswer: "${ansNorm.slice(0, 30)}" does not match any option`);
      }
    } else if (r.correctAnswer !== normOptions[idx]) {
      fixes.push({
        field: "correctAnswer",
        code: "ANSWER_CANONICALIZED",
        from: r.correctAnswer,
        to: normOptions[idx],
        confidence: "HIGH",
      });
    }
  } else {
    reviewReasons.push("options: structure invalid (cannot align answer safely)");
  }

  if (r.correctAnswer.trim() === "") {
    reviewReasons.push("correctAnswer: empty");
  }

  if (optsChanged && reviewReasons.length === 0) {
    fixes.push({
      field: "options",
      code: "OPTIONS_NFC_WS",
      from: JSON.stringify(r.options),
      to: JSON.stringify(normOptions),
      confidence: "HIGH",
    });
  }

  // Sanity: control characters anywhere on a clean record.
  const ctrl = [r.question, r.correctAnswer, r.explanation, ...normOptions].find(hasControlChars);
  if (ctrl) reviewReasons.push("control characters present in text");

  if (reviewReasons.length > 0) verdict = "REVIEW";

  return { ...r, verdict, reviewReasons, fixes, candidates };
}

export function confidenceLabel(c: Confidence): string {
  return c;
}
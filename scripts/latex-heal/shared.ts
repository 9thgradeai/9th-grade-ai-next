/**
 * scripts/latex-heal/shared.ts
 * ----------------------------------------------------------------------------
 * Shared classification for the LaTeX-artifact heal (Phase 1). Every text
 * field of every question-bearing table is pushed through the canonical
 * pipeline and bucketed:
 *
 *   CLEAN   — unchanged and renders (validation + preservation + KaTeX clean)
 *   HEALED  — pipeline changed it and the result is clean → write candidate
 *   REVIEW  — still broken after the pipeline → NEVER written, reported
 *
 * Row-level contract (migrate.ts parity): a row with ANY REVIEW field is
 * never written at all; a HEALED row must also keep correctAnswer inside
 * its options (nothing may become "worse"). Idempotent by construction:
 * after a successful heal every row re-classifies as CLEAN or REVIEW.
 * ----------------------------------------------------------------------------
 */
import katex from "katex";
import {
  normalizeMathContent,
  validateMathContent,
  checkMathPreservation,
} from "../../backend/services/math";

export type FieldVerdict = "CLEAN" | "HEALED" | "REVIEW";

export type FieldResult = {
  field: string;
  original: string;
  output: string;
  changed: boolean;
  verdict: FieldVerdict;
  reasons: string[];
};

export type RowInput = {
  id: number;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  statements?: string[];
  correctAnswers?: string[];
};

export type RowChanges = Partial<
  Pick<RowInput, "question" | "options" | "correctAnswer" | "explanation" | "statements" | "correctAnswers">
>;

export type RowResult = {
  table: string;
  id: number;
  verdict: "CLEAN" | "HEALED" | "REVIEW";
  fields: FieldResult[];
  /** Row-level failures (invariant), independent of field reasons. */
  reasons: string[];
  /** Write payload — only populated when verdict is HEALED. */
  changes: RowChanges;
};

/** Parse every `$...$`/`$$...$$` span with KaTeX (throw-on-error). */
export function katexErrors(s: string): string[] {
  const errors: string[] = [];
  if (typeof s !== "string" || !s) return errors;
  const re = /\$\$([\s\S]*?)\$\$|\$([^$\n]*?)\$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const body = m[1] ?? m[2] ?? "";
    if (!body.trim()) {
      errors.push("KATEX_EMPTY_SPAN");
      continue;
    }
    try {
      katex.renderToString(body, { throwOnError: true, strict: false });
    } catch (e) {
      const msg = String((e as Error).message).replace(/\s+/g, " ").slice(0, 110);
      errors.push(`KATEX_ERROR: ${msg}`);
    }
  }
  return errors;
}

export function classifyField(field: string, original: string): FieldResult {
  const src = typeof original === "string" ? original : "";
  const n = normalizeMathContent(src, { field });
  const output = n.output;
  const changed = output !== src;
  const reasons: string[] = [];
  for (const e of validateMathContent(output, field).errors) reasons.push(e.type);
  for (const d of checkMathPreservation(src, output, field)) {
    if (d.type.startsWith("LOST_")) reasons.push(`${d.type}${d.detail ? `(${d.detail})` : ""}`);
  }
  reasons.push(...katexErrors(output));
  const verdict: FieldVerdict = reasons.length > 0 ? "REVIEW" : changed ? "HEALED" : "CLEAN";
  return { field, original: src, output, changed, verdict, reasons };
}

export function classifyRow(table: string, row: RowInput): RowResult {
  const q = classifyField("question", row.question);
  const opts = (row.options ?? []).map((o, i) => classifyField(`options[${i}]`, o));
  const ans = classifyField("correctAnswer", row.correctAnswer);
  const ex = classifyField("explanation", row.explanation ?? "");
  const stmts = (row.statements ?? []).map((s, i) => classifyField(`statements[${i}]`, s));
  const cAs = (row.correctAnswers ?? []).map((s, i) => classifyField(`correctAnswers[${i}]`, s));
  const fields = [q, ...opts, ans, ex, ...stmts, ...cAs];

  const reasons: string[] = [];
  const anyReview = fields.some((f) => f.verdict === "REVIEW");
  const changed = fields.some((f) => f.changed);

  if (anyReview) {
    return { table, id: row.id, verdict: "REVIEW", fields, reasons, changes: {} };
  }
  if (!changed) {
    return { table, id: row.id, verdict: "CLEAN", fields, reasons, changes: {} };
  }
  // HEALED candidate — must satisfy the answer/options invariant after write.
  const optOut = opts.map((o) => o.output);
  if (!optOut.includes(ans.output)) {
    reasons.push("INVARIANT_ANSWER_NOT_IN_OPTIONS");
  }
  if (cAs.length > 0 && cAs.some((f) => !optOut.includes(f.output))) {
    reasons.push("INVARIANT_CORRECT_ANSWER_NOT_IN_OPTIONS");
  }
  if (reasons.length > 0) {
    return { table, id: row.id, verdict: "REVIEW", fields, reasons, changes: {} };
  }
  const changes: RowChanges = {};
  if (q.changed) changes.question = q.output;
  if (opts.some((o) => o.changed)) changes.options = optOut;
  if (ans.changed) changes.correctAnswer = ans.output;
  if (ex.changed) changes.explanation = ex.output;
  if (stmts.some((s) => s.changed)) changes.statements = stmts.map((s) => s.output);
  if (cAs.some((s) => s.changed)) changes.correctAnswers = cAs.map((s) => s.output);
  return { table, id: row.id, verdict: "HEALED", fields, reasons, changes };
}

// ── row loaders (Prisma → RowInput) ─────────────────────────────────────

type JsonArr = unknown;
const strArr = (v: JsonArr): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

export function mapQuestionRow(r: {
  id: number;
  question: string;
  options: JsonArr;
  correctAnswer: string;
  explanation: string;
  statements: JsonArr;
  correctAnswers: JsonArr;
}): RowInput {
  return {
    id: r.id,
    question: r.question,
    options: strArr(r.options),
    correctAnswer: r.correctAnswer,
    explanation: r.explanation,
    statements: strArr(r.statements),
    correctAnswers: strArr(r.correctAnswers),
  };
}

export function mapChildRow(r: {
  id: number;
  question: string;
  options: JsonArr;
  correctAnswer: string;
  explanation: string;
}): RowInput {
  return {
    id: r.id,
    question: r.question,
    options: strArr(r.options),
    correctAnswer: r.correctAnswer,
    explanation: r.explanation,
  };
}

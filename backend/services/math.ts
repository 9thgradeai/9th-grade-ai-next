/**
 * backend/services/math.ts
 * ----------------------------------------------------------------------------
 * Server-side facade over the SINGLE canonical math layer
 * (@/lib/math/canonical-math). Route handlers and ingestion code import
 * from HERE (never from scripts/ directly) so the boundary is explicit:
 *
 *   SOURCE → adapter → normalize → validate → preserve → MCQ check → Prisma
 *
 * NOTE: intentionally NO `server-only` import — this module is pure math
 * (no secrets) and MUST be reusable from seed/import/migration scripts
 * (tsx) per the canonical-pipeline contract.
 * ----------------------------------------------------------------------------
 */
export {
  normalizeMathContent,
  toCanonicalMath,
  validateMathContent,
  checkMathPreservation,
  detectLegacyMath,
  adaptPlainText,
  adaptOmmlText,
  adaptAiMcq,
  adaptManualInput,
  validateMcq,
  AI_MATH_SYSTEM_INSTRUCTION,
  splitLatexBraced,
} from "@/lib/math/canonical-math";
export type {
  MathDiagnostic,
  NormalizeOptions,
  NormalizeResult,
  ValidationResult,
  AiMcqJson,
} from "@/lib/math/canonical-math";

/** Normalize every MCQ text field; returns normalized record + diagnostics. */
import katex from "katex";
import {
  normalizeMathContent,
  validateMathContent,
  checkMathPreservation,
  type MathDiagnostic,
} from "@/lib/math/canonical-math";

export type McqTextFields = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

export function normalizeMcqFields<T extends McqTextFields>(rec: T): {
  record: T;
  changed: boolean;
  diagnostics: MathDiagnostic[];
} {
  const diagnostics: MathDiagnostic[] = [];
  let changed = false;
  const field = (name: string, v: string) => {
    const r = normalizeMathContent(v ?? "", { field: name });
    if (r.changed) changed = true;
    diagnostics.push(...r.diagnostics);
    const pres = checkMathPreservation(v ?? "", r.output, name);
    diagnostics.push(...pres);
    const val = validateMathContent(r.output, name);
    diagnostics.push(...val.errors);
    return r.output;
  };
  const options = (rec.options ?? []).map((o, i) => field(`options[${i}]`, o));
  const record = {
    ...rec,
    question: field("question", rec.question),
    options,
    correctAnswer: field("correctAnswer", rec.correctAnswer),
    explanation: field("explanation", rec.explanation ?? ""),
  };
  return { record, changed, diagnostics };
}

/**
 * Display-time safety net (read path): normalize one STORED text field for
 * rendering. Returns the normalized form ONLY when it is fully clean
 * (validation + no LOST_* preservation + every `$…$` span parses in KaTeX
 * with throwOnError); otherwise returns the source byte-identical.
 *
 * Contract: never throws, never writes (DB rows untouched — callers map
 * DTOs through this), idempotent, and deterministic per input string (so
 * the answer-in-options invariant survives: identical sources map to
 * identical outputs). Unchanged prose returns by reference-equal fast path.
 */
export function normalizeFieldForDisplay(input: unknown, field = "field"): string {
  const src = typeof input === "string" ? input : "";
  if (!src) return src;
  let out: string;
  try {
    out = normalizeMathContent(src, { field }).output;
  } catch {
    return src;
  }
  if (out === src) return src;
  try {
    if (validateMathContent(out, field).errors.length > 0) return src;
    if (
      checkMathPreservation(src, out, field).some((d) => d.type.startsWith("LOST_"))
    )
      return src;
    const re = /\$\$([\s\S]*?)\$\$|\$([^$\n]*?)\$/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(out)) !== null) {
      const body = (m[1] ?? m[2] ?? "").trim();
      if (!body) return src;
      katex.renderToString(body, { throwOnError: true, strict: false });
    }
  } catch {
    return src;
  }
  return out;
}

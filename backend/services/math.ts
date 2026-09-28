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
} from "@/lib/math/canonical-math";
export type {
  MathDiagnostic,
  NormalizeOptions,
  NormalizeResult,
  ValidationResult,
  AiMcqJson,
} from "@/lib/math/canonical-math";

/** Normalize every MCQ text field; returns normalized record + diagnostics. */
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

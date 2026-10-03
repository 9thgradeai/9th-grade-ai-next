import { aiJsonWithMeta } from "./client";
import type { EvaluationResultDto } from "./types";

export type EvaluateAnswerOptions = {
  question: string;
  learnerAnswer: string;
  questionId?: number;
  subjectId?: number;
};

/** Evaluate a learner's written answer via the AI evaluator. */
export async function evaluateAnswer(opts: EvaluateAnswerOptions): Promise<EvaluationResultDto> {
  const { data, meta } = await aiJsonWithMeta<EvaluationResultDto>("/api/ai/evaluate", "POST", opts);
  return { ...data, source: data.source || meta.source || "ai", model: meta.model || undefined };
}

"use client";

import { aiJson } from "./client";
import type { EvaluationResultDto } from "./types";

export type EvaluateAnswerOptions = {
  question: string;
  learnerAnswer: string;
  questionId?: number;
  subjectId?: number;
};

/** Evaluate a learner's written answer via the AI evaluator. */
export async function evaluateAnswer(opts: EvaluateAnswerOptions): Promise<EvaluationResultDto> {
  return aiJson<EvaluationResultDto>("/api/ai/evaluate", "POST", opts);
}

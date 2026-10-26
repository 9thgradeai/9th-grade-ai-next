"use client";

import { AIError, aiJsonWithMeta, type AiJsonMeta } from "./client";
import type { VerifiedExplanationDto } from "@/lib/types/verified-explanation";

export type VerifiedExplainInput = {
  questionId: number;
  /** Preferred: every option the student picked. */
  selectedAnswers?: string[];
  /** Legacy single-answer fallback. */
  selectedAnswer?: string;
  /** Option texts in the order the student saw them (session shuffle). */
  displayOptions?: string[];
  attemptId?: string;
  enableSearch?: boolean;
};

export type VerifiedExplainResponse = {
  data: VerifiedExplanationDto;
  meta: AiJsonMeta;
};

/**
 * Ask for the independent, evidence-backed explanation. The client sends no
 * answer key — only the question id, its own selection, and its display order.
 */
export async function getVerifiedExplanation(
  input: VerifiedExplainInput,
): Promise<VerifiedExplainResponse> {
  const body: Record<string, unknown> = { questionId: input.questionId };
  if (input.selectedAnswers && input.selectedAnswers.length > 0) {
    body.selectedAnswers = input.selectedAnswers;
  } else if (input.selectedAnswer) {
    body.selectedAnswer = input.selectedAnswer;
  }
  if (input.displayOptions && input.displayOptions.length > 0) {
    body.displayOptions = input.displayOptions;
  }
  if (input.attemptId) body.attemptId = input.attemptId;
  if (input.enableSearch !== undefined) body.enableSearch = input.enableSearch;

  return aiJsonWithMeta<VerifiedExplanationDto>("/api/ai/explain-v2", "POST", body);
}

/** Any v2 failure is recoverable: the caller may show the labelled legacy UI. */
export function isVerifiedExplanationUnavailable(error: unknown): boolean {
  if (error instanceof AIError) {
    return error.status !== 401 && error.status !== 403;
  }
  return true;
}

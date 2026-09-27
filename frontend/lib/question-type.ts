import type { Server } from "@/lib/types";

export type QuestionType = Server.QuestionDTO["questionType"];

/** Authoritative correct set: correctAnswers iff non-empty, else [correctAnswer]. */
export function getCorrectSet(q: Pick<Server.QuestionDTO, "correctAnswer" | "correctAnswers">): string[] {
  const set = q.correctAnswers?.length ? q.correctAnswers : [q.correctAnswer];
  return [...new Set(set.map((s) => s.trim()))].filter((s) => s.length > 0);
}

/**
 * All-or-nothing grading: correct iff the selected set exactly equals the
 * correct set (order-insensitive, whitespace-insensitive). Single-choice is
 * the degenerate 1-element case — one code path for every question type.
 */
export function isAnswerCorrect(
  q: Pick<Server.QuestionDTO, "correctAnswer" | "correctAnswers">,
  selected: readonly string[],
): boolean {
  const correct = getCorrectSet(q);
  const picked = [...new Set(selected.map((s) => s.trim()))].filter((s) => s.length > 0);
  return picked.length === correct.length && picked.every((s) => correct.includes(s));
}

/** Serialize a multi-pick for QuestionAttempt.selectedAnswer (existing string column). */
export function serializeAnswer(selected: readonly string[]): string {
  return selected.map((s) => s.trim()).filter(Boolean).join(" ‖ ");
}

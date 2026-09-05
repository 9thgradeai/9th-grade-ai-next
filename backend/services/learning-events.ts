// backend/services/learning-events.ts — LearningEvent projection helpers.
//
// The LearningEvent table is a denormalized, replay-safe timeline of a user's
// study activity (attempts, sessions, exams, AI turns). This module maps
// already-committed DOMAIN EVENTS into LearningEvent rows so every write path
// stays on the existing event bus instead of sprinkling table writes through
// services. Mapping functions are PURE (unit-testable without Prisma); only
// `recordLearningEvents` touches the database.

import "server-only";

import { prisma } from "~backend/db";
import type { Prisma } from "@prisma/client";
import type { AttemptFact, AiTurnKind } from "~backend/events/types";

export type LearningEventRow = Prisma.LearningEventCreateManyInput;

/** Per-question event row: answered → CORRECT/WRONG, unanswered → SKIPPED. */
export function attemptEventRow(
  fact: AttemptFact,
  userId: string,
  occurredAt: Date,
): LearningEventRow {
  const base = {
    userId,
    questionId: fact.questionId ?? null,
    subjectId: fact.subjectId ?? null,
    topicId: fact.topicId ?? null,
    occurredAt,
  };
if (!fact.answered) {
    return { ...base, type: "QUESTION_SKIPPED" };
  }
  return {
    ...base,
    type: fact.correct ? "QUESTION_CORRECT" : "QUESTION_WRONG",
  };
}

/** Session marker + one row per attempt fact (practice / daily quiz / exam). */
export function sessionEventRows(
  userId: string,
  type: "SESSION_COMPLETED" | "MOCK_EXAM_COMPLETED",
  attempts: AttemptFact[],
  extra: Record<string, unknown> = {},
): LearningEventRow[] {
  const occurredAt = new Date();
  return [
    {
      userId,
      type,
      occurredAt,
      metadata: {
        questionCount: attempts.length,
        correctCount: attempts.filter((a) => a.answered && a.correct).length,
        ...extra,
      },
    },
    ...attempts.map((a) => attemptEventRow(a, userId, occurredAt)),
  ];
}

/** Flashcard review → TOPIC_REVIEWED (spaced-repetition activity marker). */
export function flashcardEventRow(
  userId: string,
  flashcardId: number,
  rating: number,
): LearningEventRow {
  return {
    userId,
    type: "TOPIC_REVIEWED",
    occurredAt: new Date(),
    metadata: { source: "flashcard", flashcardId, rating },
  };
}

/** AI turn → AI_EXPLANATION_REQUESTED for solution/explain turns, else AI_TUTOR_SESSION. */
export function aiTurnEventRows(
  userId: string,
  intent: string,
  kind: AiTurnKind,
): LearningEventRow {
  const isExplanationTurn = ["solve", "explain", "hint", "reason"].includes(intent);
  return {
    userId,
    type: isExplanationTurn ? "AI_EXPLANATION_REQUESTED" : "AI_TUTOR_SESSION",
    occurredAt: new Date(),
    metadata: { intent, kind },
  };
}

/**
 * Persist LearningEvent rows. No-op for empty input. Callers may treat
 * failures as non-fatal (the event bus already isolates handler errors).
 */
export async function recordLearningEvents(rows: LearningEventRow[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.learningEvent.createMany({ data: rows });
}
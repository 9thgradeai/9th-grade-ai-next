// backend/events/learning-events.ts — domain-event → LearningEvent projection.
// Maps already-committed facts (practice, exam, daily quiz, flashcards, AI
// turns) into the denormalized LearningEvent timeline. Registered once in
// subscribers.ts; the bus isolates any failure from the producing service.

import "server-only";

import type { DomainEvent } from "./types";
import {
  attemptEventRow,
  aiTurnEventRows,
  flashcardEventRow,
  recordLearningEvents,
  sessionEventRows,
  type LearningEventRow,
} from "~backend/services/learning-events";

/** Pure projection: domain event → LearningEvent rows (or [] when unmapped). */
export function learningEventRowsFor(event: DomainEvent): LearningEventRow[] {
  const occurredAt = new Date();
  switch (event.name) {
    case "PRACTICE_SUBMITTED":
      return sessionEventRows(event.userId, "SESSION_COMPLETED", event.attempts, {
        source: "practice",
        score: event.score,
      });
    case "EXAM_COMPLETED":
      return sessionEventRows(event.userId, "MOCK_EXAM_COMPLETED", event.attempts, {
        source: "exam",
        finalScore: event.finalScore,
        attemptId: event.attemptId,
      });
    case "DAILY_QUIZ_COMPLETED":
      return sessionEventRows(event.userId, "SESSION_COMPLETED", event.attempts, {
        source: "daily_quiz",
        quizId: event.quizId,
        score: event.score,
      });
    case "FLASHCARD_REVIEWED":
      return [flashcardEventRow(event.userId, event.flashcardId, event.rating)];
    case "AI_TUTOR_TURN":
      return [aiTurnEventRows(event.userId, event.intent, event.kind)];
    default:
      return [];
  }
}

/** Subscriber wrapper — persists the projection, never throws outward. */
export async function recordLearningEventsForEvent(event: DomainEvent): Promise<void> {
  const rows = learningEventRowsFor(event);
  if (rows.length === 0) return;
  await recordLearningEvents(rows);
}

// Re-export the pure mapper so tests can exercise it without the DB.
export { attemptEventRow } from "~backend/services/learning-events";
// backend/events/types.ts — domain event catalog (Phase 11).
// Events are FACTS that already happened. Services emit them after their
// transaction commits; consumers must treat payloads as read-only.

export type DomainEvent =
  | { name: "PRACTICE_SUBMITTED"; userId: string; correct: number; total: number; score: number }
  | { name: "EXAM_COMPLETED"; userId: string; correct: number; wrong: number; finalScore: number }
  | { name: "DAILY_QUIZ_COMPLETED"; userId: string; quizId: number; score: number }
  | { name: "FLASHCARD_REVIEWED"; userId: string; flashcardId: number; rating: number }
  | { name: "AI_TUTOR_TURN"; userId: string; intent: string };

export type DomainEventName = DomainEvent["name"];

export type EventHandler<T extends DomainEventName = DomainEventName> = (
  event: Extract<DomainEvent, { name: T }>,
) => void | Promise<void>;

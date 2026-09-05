// backend/events/types.ts — domain event catalog (Phase 11, extended Phase 2).
// Events are FACTS that already happened. Services emit them after their
// transaction commits; consumers must treat payloads as read-only.
//
// PRACTICE_SUBMITTED / EXAM_COMPLETED / DAILY_QUIZ_COMPLETED carry per-question
// `attempts` facts so phase-2 consumers (LearningEvent projection) can replay
// the outcome WITHOUT re-querying or re-grading.

/** One answered (or deliberately skipped) question inside a submission. */
export type AttemptFact = {
  questionId: number | null;
  /** Outcome of the question. */
  correct: boolean;
  /** false when the learner submitted an empty answer (exam review path). */
  answered: boolean;
  subjectId?: number | null;
  topicId?: number | null;
};

export type AiTurnKind = "agent" | "tutor" | "assistant";

export type DomainEvent =
  | {
      name: "PRACTICE_SUBMITTED";
      userId: string;
      correct: number;
      total: number;
      score: number;
      attempts: AttemptFact[];
    }
  | {
      name: "EXAM_COMPLETED";
      userId: string;
      correct: number;
      wrong: number;
      finalScore: number;
      attemptId?: string;
      attempts: AttemptFact[];
    }
  | {
      name: "DAILY_QUIZ_COMPLETED";
      userId: string;
      quizId: number;
      score: number;
      attempts: AttemptFact[];
    }
  | { name: "FLASHCARD_REVIEWED"; userId: string; flashcardId: number; rating: number }
  | { name: "AI_TUTOR_TURN"; userId: string; intent: string; kind: AiTurnKind };

export type DomainEventName = DomainEvent["name"];

export type EventHandler<T extends DomainEventName = DomainEventName> = (
  event: Extract<DomainEvent, { name: T }>,
) => void | Promise<void>;
import { describe, it, expect } from "vitest";
import { learningEventRowsFor } from "~backend/events/learning-events";
import type { DomainEvent, AttemptFact } from "~backend/events/types";

const USER = "learning-events-test-user";

const practiceAttempts: AttemptFact[] = [
  { questionId: 1, correct: true, answered: true, subjectId: 10, topicId: 20 },
  { questionId: 2, correct: false, answered: true, subjectId: 10, topicId: 21 },
  { questionId: 3, correct: false, answered: false, subjectId: 11, topicId: 22 },
];

describe("learning-events projection (§2 attempt facts → LearningEvent rows)", () => {
  it("projects a practice submission into a session marker + per-attempt rows", () => {
    const event: DomainEvent = {
      name: "PRACTICE_SUBMITTED",
      userId: USER,
      correct: 1,
      total: 3,
      score: 33,
      attempts: practiceAttempts,
    };
    const rows = learningEventRowsFor(event);

    expect(rows).toHaveLength(4); // 1 session + 3 attempts
    expect(rows[0].type).toBe("SESSION_COMPLETED");
    expect(rows[0].userId).toBe(USER);
    expect(rows[0].metadata).toMatchObject({
      source: "practice",
      questionCount: 3,
      correctCount: 1,
    });

    // attempt rows in order: correct → wrong → skipped
    expect(rows[1]).toMatchObject({ type: "QUESTION_CORRECT", questionId: 1, subjectId: 10, topicId: 20 });
    expect(rows[2]).toMatchObject({ type: "QUESTION_WRONG", questionId: 2, subjectId: 10, topicId: 21 });
    expect(rows[3]).toMatchObject({ type: "QUESTION_SKIPPED", questionId: 3, subjectId: 11, topicId: 22 });
  });

  it("projects an exam completion with attemptId kept in the session metadata", () => {
    const event: DomainEvent = {
      name: "EXAM_COMPLETED",
      userId: USER,
      correct: 1,
      wrong: 1,
      finalScore: 50,
      attemptId: "exam-attempt-abc",
      attempts: [
        { questionId: 5, correct: true, answered: true },
        { questionId: 6, correct: false, answered: true },
      ],
    };
    const rows = learningEventRowsFor(event);
    expect(rows[0].type).toBe("MOCK_EXAM_COMPLETED");
    expect(rows[0].metadata).toMatchObject({ source: "exam", attemptId: "exam-attempt-abc" });
    expect(rows).toHaveLength(3);
  });

  it("projects a daily quiz completion as a session with quizId", () => {
    const event: DomainEvent = {
      name: "DAILY_QUIZ_COMPLETED",
      userId: USER,
      quizId: 42,
      score: 50,
      attempts: [{ questionId: 7, correct: false, answered: true }],
    };
    const rows = learningEventRowsFor(event);
    expect(rows[0].type).toBe("SESSION_COMPLETED");
    expect(rows[0].metadata).toMatchObject({ source: "daily_quiz", quizId: 42 });
    expect(rows).toHaveLength(2);
  });

  it("projects a flashcard review into a topic-review marker", () => {
    const rows = learningEventRowsFor({
      name: "FLASHCARD_REVIEWED",
      userId: USER,
      flashcardId: 99,
      rating: 3,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("TOPIC_REVIEWED");
    expect(rows[0].metadata).toMatchObject({ source: "flashcard", flashcardId: 99, rating: 3 });
  });

  it("projects an explain/solve AI turn as AI_EXPLANATION_REQUESTED", () => {
    const rows = learningEventRowsFor({
      name: "AI_TUTOR_TURN",
      userId: USER,
      intent: "solve",
      kind: "agent",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("AI_EXPLANATION_REQUESTED");
    expect(rows[0].metadata).toMatchObject({ intent: "solve", kind: "agent" });
  });

  it("projects a non-explanation AI turn as AI_TUTOR_SESSION", () => {
    const rows = learningEventRowsFor({
      name: "AI_TUTOR_TURN",
      userId: USER,
      intent: "étude",
      kind: "assistant",
    });
    expect(rows[0].type).toBe("AI_TUTOR_SESSION");
  });
});
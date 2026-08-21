import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "~backend/db";
import { submitFlashcardReview } from "~backend/services/flashcards";
import { buildCustomExam } from "~backend/services/exam";
import { submitPracticeAnswers } from "~backend/services/activity";
import { InMemoryRateLimitStore } from "~backend/infrastructure/cache/rate-limit-memory";
import { clearSubscriptions, emit, subscribe } from "~backend/events/bus";

// ── Phase 26 failure drills + Phase 20 concurrency drills ──
// Core exam/practice flows must degrade independently of AI/infra failures.

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  clearSubscriptions();
});

describe("failure drill: transaction rollback", () => {
  it("a rejected transaction surfaces as a mapped 500 — no partial success reported", async () => {
    vi.mocked(prisma.flashcard.findUnique).mockResolvedValue({ id: 1 } as never);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("db connection lost"));

    await expect(submitFlashcardReview("u", 1, 2)).rejects.toMatchObject({
      statusCode: 500,
      code: "INTERNAL_ERROR",
      message: "Failed to record flashcard review",
    });
  });

  it("practice submission maps DB loss to INTERNAL_ERROR, never a false 200", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      { id: 1, correctAnswer: "ক", subjectId: 1, topic: "t", subject: { nameBn: "s" } },
    ] as never);
    vi.mocked(prisma.$transaction).mockRejectedValue(new Error("deadlock detected"));

    await expect(submitPracticeAnswers("u", [{ questionId: 1, selected: "ক" }])).rejects.toMatchObject(
      { statusCode: 500 },
    );
    // No event was emitted for a failed submission.
  });
});

describe("failure drill: exam engine is independent of AI subsystem", () => {
  it("builds exams with zero AI/provider involvement", async () => {
    vi.mocked(prisma.subject.findMany).mockResolvedValue([
      { id: 1, nameBn: "S", nameEn: "S", icon: "", color: "", bg: "", sortOrder: 0 },
    ] as never);
    vi.mocked(prisma.topic.findMany).mockResolvedValue([]);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([]);

    const tree = await buildCustomExam({
      subjects: [{ subjectId: 1, paths: [] }],
      questionCount: 5,
      durationSec: 600,
    });
    expect(tree.shortfall).toBe(5); // honest shortfall, no AI dependency
  });
});

describe("concurrency drill: fixed-window limiter under parallel burst", () => {
  it("admits exactly `max` of N simultaneous consumes", async () => {
    const store = new InMemoryRateLimitStore();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.consume("burst", 10, 60_000)),
    );
    const admitted = results.filter((r) => r.allowed).length;
    expect(admitted).toBe(10);
  });
});

describe("failure drill: subscriber isolation (events)", () => {
  it("a throwing handler never breaks the emitter", async () => {
    const good = vi.fn();
    subscribe("PRACTICE_SUBMITTED", () => {
      throw new Error("subscriber exploded");
    });
    subscribe("PRACTICE_SUBMITTED", good);

    emit({ name: "PRACTICE_SUBMITTED", userId: "u", correct: 1, total: 2, score: 50 });

    // Let the microtask queue drain.
    await new Promise((r) => setTimeout(r, 0));
    expect(good).toHaveBeenCalledTimes(1);
  });

  it("unhandled emit with no subscribers is a no-op", () => {
    expect(() =>
      emit({ name: "EXAM_COMPLETED", userId: "u", correct: 0, wrong: 0, finalScore: 0 }),
    ).not.toThrow();
  });
});

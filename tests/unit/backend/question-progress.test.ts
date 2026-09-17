import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { recordQuestionAttempt } from "~backend/services/question-progress";

function progressRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: "user-1",
    questionId: 1,
    totalAttempts: 1,
    correctAttempts: 0,
    incorrectAttempts: 1,
    consecutiveCorrect: 0,
    consecutiveIncorrect: 1,
    mistakeCount: 1,
    masteryScore: 0,
    masteryStatus: "STRUGGLING",
    masteredAt: null,
    isMistake: true,
    firstIncorrectAt: new Date("2024-01-01"),
    lastIncorrectAt: new Date("2024-01-01"),
    lastCorrectAt: null,
    reviewCount: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    lastSubject: "Math",
    lastTopic: "Algebra",
    lastExam: "",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

const tx = prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordQuestionAttempt", () => {
  it("creates a progress row on first incorrect attempt", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(null);
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: false,
      subject: "Math",
      topic: "Algebra",
    });

    const upsertCall = tx.userQuestionProgress.upsert.mock.calls[0][0];
    expect(upsertCall.create.masteryStatus).toBe("STRUGGLING");
    expect(upsertCall.create.isMistake).toBe(true);
    expect(upsertCall.create.mistakeCount).toBe(1);
    expect(upsertCall.create.incorrectAttempts).toBe(1);
  });

  it("creates a progress row on first correct attempt", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(null);
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: true,
    });

    const upsertCall = tx.userQuestionProgress.upsert.mock.calls[0][0];
    expect(upsertCall.create.masteryStatus).toBe("NEW");
    expect(upsertCall.create.isMistake).toBe(false);
    expect(upsertCall.create.correctAttempts).toBe(1);
  });

  it("increments mistake count on repeated incorrect attempts", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({ mistakeCount: 3, totalAttempts: 3, incorrectAttempts: 3 }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: false,
    });

    const update = tx.userQuestionProgress.upsert.mock.calls[0][0].update;
    expect(update.mistakeCount).toBe(4);
    expect(update.totalAttempts).toBe(4);
    expect(update.incorrectAttempts).toBe(4);
  });

  it("advances mastery after consecutive correct answers", async () => {
    // Simulate 2 prior correct answers in a row (REVIEWING state)
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({
        masteryStatus: "REVIEWING",
        consecutiveCorrect: 1,
        totalAttempts: 2,
        correctAttempts: 1,
        isMistake: true,
      }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: true,
    });

    const update = tx.userQuestionProgress.upsert.mock.calls[0][0].update;
    expect(update.masteryStatus).toBe("IMPROVING");
    expect(update.consecutiveCorrect).toBe(2);
  });

  it("regresses mastered question back to struggling on incorrect", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({
        masteryStatus: "MASTERED",
        consecutiveCorrect: 3,
        totalAttempts: 5,
        correctAttempts: 4,
        isMistake: false,
      }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: false,
    });

    const update = tx.userQuestionProgress.upsert.mock.calls[0][0].update;
    expect(update.masteryStatus).toBe("STRUGGLING");
    expect(update.isMistake).toBe(true);
    expect(update.mistakeCount).toBe(2);
  });

  it("updates lastCorrectAt and schedules next review", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({ isMistake: true, reviewCount: 1 }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: true,
    });

    const update = tx.userQuestionProgress.upsert.mock.calls[0][0].update;
    expect(update.lastCorrectAt).toBeInstanceOf(Date);
    expect(update.reviewCount).toBe(2);
    expect(update.lastReviewedAt).toBeInstanceOf(Date);
  });

  it("sets nextReviewAt for mistakes", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({ isMistake: true, masteryStatus: "STRUGGLING" }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: false,
    });

    const update = tx.userQuestionProgress.upsert.mock.calls[0][0].update;
    expect(update.nextReviewAt).toBeInstanceOf(Date);
    expect(update.isMistake).toBe(true);
  });

  it("does not throw when upsert fails (swallows, keeps flow alive)", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(null);
    tx.userQuestionProgress.upsert.mockRejectedValue(new Error("db down"));

    await expect(
      recordQuestionAttempt(tx, {
        userId: "user-1",
        questionId: 1,
        isCorrect: false,
      }),
    ).resolves.toBeNull();
  });

  it("returns resulting mastery feedback on a successful attempt", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({ masteryStatus: "STRUGGLING", isMistake: true, consecutiveCorrect: 0 }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    const result = await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: true,
    });

    expect(result).toEqual({
      masteryStatus: "REVIEWING",
      isMistake: true,
      justMastered: false,
    });
  });

  it("flags justMastered when the attempt promotes to MASTERED", async () => {
    tx.userQuestionProgress.findUnique.mockResolvedValue(
      progressRow({
        masteryStatus: "IMPROVING",
        consecutiveCorrect: 2,
        isMistake: true,
      }),
    );
    tx.userQuestionProgress.upsert.mockResolvedValue({});

    const result = await recordQuestionAttempt(tx, {
      userId: "user-1",
      questionId: 1,
      isCorrect: true,
    });

    expect(result?.justMastered).toBe(true);
    expect(result?.masteryStatus).toBe("MASTERED");
    expect(result?.isMistake).toBe(false);
  });
});

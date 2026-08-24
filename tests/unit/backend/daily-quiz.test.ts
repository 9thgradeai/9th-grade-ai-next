import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getDailyQuiz } from "~backend/services/content";
import { submitDailyQuiz } from "~backend/services/activity";

const QUIZ = {
  id: 7,
  date: "2026-08-22",
  completed: true, // legacy global flag — service must IGNORE this
  score: 99,
  claimed: true,
  createdAt: new Date("2026-08-22T00:00:00Z"),
  questions: [
    {
      id: 101,
      subject: "সাধারণ বিজ্ঞান",
      topic: "পদার্থবিজ্ঞান",
      question: "পানির স্ফুটনাঙ্ক কত?",
      options: ["৮০°C", "৯০°C", "১০০°C", "১১০°C"],
      correctAnswer: "১০০°C",
      explanation: "সমুদ্রপৃষ্ঠে পানির স্ফুটনাঙ্ক ১০০°C।",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.dailyQuiz.findFirst).mockResolvedValue(QUIZ as never);
});

describe("getDailyQuiz (per-user participation)", () => {
  it("returns neutral flags for anonymous callers even when a global flag is set", async () => {
    const quiz = await getDailyQuiz(null);
    expect(quiz).not.toBeNull();
    expect(quiz!.completed).toBe(false);
    expect(quiz!.score).toBe(0);
    expect(quiz!.id).toBe(7);
    expect(prisma.dailyQuizParticipation.findUnique).not.toHaveBeenCalled();
  });

  it("maps the requesting user's participation onto the DTO", async () => {
    vi.mocked(prisma.dailyQuizParticipation.findUnique).mockResolvedValue({
      id: 1,
      userId: "userA",
      quizId: 7,
      status: "COMPLETED",
      score: 75,
      correct: 3,
      total: 4,
      pointsEarned: 30,
      completedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const quiz = await getDailyQuiz("userA");
    expect(quiz!.completed).toBe(true);
    expect(quiz!.score).toBe(75);
    expect(quiz!.claimed).toBe(false); // legacy claimed flag retired
    expect(prisma.dailyQuizParticipation.findUnique).toHaveBeenCalledWith({
      where: { userId_quizId: { userId: "userA", quizId: 7 } },
    });
  });

  it("keeps users isolated: userB sees no completion when only userA participated", async () => {
    vi.mocked(prisma.dailyQuizParticipation.findUnique).mockResolvedValue(null);

    const quiz = await getDailyQuiz("userB");
    expect(quiz!.completed).toBe(false);
    expect(quiz!.score).toBe(0);
    // The lookup is scoped to the composite key — one user's row can never
    // satisfy another user's query.
    expect(prisma.dailyQuizParticipation.findUnique).toHaveBeenCalledWith({
      where: { userId_quizId: { userId: "userB", quizId: 7 } },
    });
  });
});

describe("submitDailyQuiz (transactional participation write)", () => {
  function txSpies() {
    return {
      questionAttempt: prisma.questionAttempt,
      userProgress: prisma.userProgress,
      dailyQuizParticipation: prisma.dailyQuizParticipation,
      $executeRaw: prisma.$executeRaw,
    };
  }

  it("writes attempts, progress and participation atomically", async () => {
    vi.mocked(prisma.dailyQuiz.findUnique).mockResolvedValue(QUIZ as never);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.dailyQuizParticipation.upsert).mockResolvedValue({} as never);

    const tx = txSpies();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: typeof tx) => Promise<unknown>)(tx),
    );

    const summary = await submitDailyQuiz("userA", 7, [
      { questionId: 101, selected: "১০০°C" },
    ]);

    expect(summary).toEqual({ correct: 1, total: 1, score: 100, pointsEarned: 10 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.questionAttempt.createMany).toHaveBeenCalledTimes(1);
    // Progress recompute is the single-statement atomic upsert (Phase 5) —
    // parameterized with the user id and points.
    const rawCall = vi.mocked(prisma.$executeRaw).mock.calls[0];
    expect(String(rawCall[0])).toContain("UserProgress");
    // Params: userId, points, examsIncrement — each interpolated twice
    // (insert branch + conflict-update branch).
    expect(rawCall.slice(1)).toEqual(["userA", 10, 0, "userA"]);
    expect(prisma.dailyQuizParticipation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_quizId: { userId: "userA", quizId: 7 } },
        create: expect.objectContaining({
          status: "COMPLETED",
          score: 100,
          correct: 1,
          total: 1,
          pointsEarned: 10,
        }),
        update: expect.objectContaining({ status: "COMPLETED", completedAt: expect.any(Date) }),
      }),
    );
  });

  it("never writes the legacy global flags on DailyQuiz", async () => {
    vi.mocked(prisma.dailyQuiz.findUnique).mockResolvedValue(QUIZ as never);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.dailyQuizParticipation.upsert).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: ReturnType<typeof txSpies>) => Promise<unknown>)(txSpies()),
    );

    await submitDailyQuiz("userA", 7, [{ questionId: 101, selected: "গলত" }]);
    expect(prisma.dailyQuiz.update).not.toHaveBeenCalled();
  });

  it("404s for an unknown quiz without touching any table writes", async () => {
    vi.mocked(prisma.dailyQuiz.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (t: ReturnType<typeof txSpies>) => Promise<unknown>)(txSpies()),
    );

    await expect(submitDailyQuiz("userA", 999, [])).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
    expect(prisma.questionAttempt.createMany).not.toHaveBeenCalled();
    expect(prisma.dailyQuizParticipation.upsert).not.toHaveBeenCalled();
  });
});

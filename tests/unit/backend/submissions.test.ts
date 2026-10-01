import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { submitPracticeAnswers } from "~backend/services/activity";
import { createUser } from "~backend/services/user";
import { hash } from "bcryptjs";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitPracticeAnswers (atomic attempts + progress)", () => {
  it("grades against DB truth and commits attempts + progress in one transaction", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      {
        id: 1,
        correctAnswer: "খ",
        subjectId: 3,
        topic: "ব্যাকরণ",
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
      },
      {
        id: 2,
        correctAnswer: "গ",
        subjectId: 3,
        topic: "ব্যাকরণ",
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
      },
    ] as never);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (tx: unknown) => Promise<unknown>)(prisma),
    );

    const summary = await submitPracticeAnswers("userA", [
      { questionId: 1, selected: "খ" },
      { questionId: 2, selected: "ঘ" },
    ]);

    expect(summary).toEqual({
      correct: 1,
      total: 2,
      score: 50,
      pointsEarned: 10,
      wrong: 1,
      negativeMarks: 0.5,
      finalScore: 0.5,
      penaltyPerWrong: 0.5,
      feedback: {
        1: { masteryStatus: "NEW", isMistake: false, justMastered: false },
        2: { masteryStatus: "STRUGGLING", isMistake: true, justMastered: false },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const attempts = vi.mocked(prisma.questionAttempt.createMany).mock.calls[0][0];
    expect(attempts.data).toHaveLength(2);
    expect(attempts.data.every((a: { source: string }) => a.source === "practice")).toBe(true);
    expect(attempts.data[0].correct).toBe(true);
    expect(attempts.data[1].correct).toBe(false);

    const rawArgs = vi.mocked(prisma.$executeRaw).mock.calls[0];
    expect(rawArgs.slice(1)).toEqual(["userA", 10, 0, "userA"]);
  });

  it("rejects answers referencing unknown questions without any writes", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([] as never);
    await expect(submitPracticeAnswers("userA", [{ questionId: 99, selected: "ক" }])).rejects.toMatchObject(
      { statusCode: 400 },
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.questionAttempt.createMany).not.toHaveBeenCalled();
  });

  it("rejects malformed answer entries without any writes", async () => {
    await expect(
      submitPracticeAnswers("userA", [{ questionId: NaN, selected: "ক" }]),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("submitPracticeAnswers (multi-pick, all-or-nothing)", () => {
  const multiRow = {
    id: 7,
    correctAnswer: "A",
    correctAnswers: ["A", "C"],
    subjectId: 9,
    ecosystemId: 2,
    topicId: null,
    topic: "T",
    difficulty: "MEDIUM",
    subject: { nameBn: "English" },
  };

  beforeEach(() => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([multiRow] as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (tx: unknown) => Promise<unknown>)(prisma),
    );
  });

  it("grades the exact set correct regardless of order", async () => {
    const summary = await submitPracticeAnswers("userA", [{ questionId: 7, selected: ["C", "A"] }]);
    expect(summary.correct).toBe(1);
    expect(summary.total).toBe(1);
    const data = vi.mocked(prisma.questionAttempt.createMany).mock.calls[0][0].data;
    expect(data[0].correct).toBe(true);
    expect(data[0].selectedAnswer).toBe("C ‖ A");
  });

  it("grades partial and superset picks wrong", async () => {
    for (const selected of [["A"], ["A", "C", "D"], ["B"]]) {
      vi.clearAllMocks();
      const summary = await submitPracticeAnswers("userA", [{ questionId: 7, selected }]);
      expect(summary.correct).toBe(0);
    }
  });

  it("skips empty picks without recording attempts", async () => {
    const summary = await submitPracticeAnswers("userA", [{ questionId: 7, selected: [] }]);
    expect(summary.total).toBe(0);
    expect(prisma.questionAttempt.createMany).not.toHaveBeenCalled();
  });

  it("keeps legacy single-string picks working", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      { ...multiRow, id: 8, correctAnswers: [] },
    ] as never);
    const summary = await submitPracticeAnswers("userA", [{ questionId: 8, selected: "A" }]);
    expect(summary.correct).toBe(1);
  });
});

describe("submitPracticeAnswers (ecosystem negative marking)", () => {
  const bankRow = {
    id: 21,
    correctAnswer: "ক",
    correctAnswers: [],
    subjectId: 5,
    ecosystemId: 2,
    topicId: null,
    topic: "সাধারণ জ্ঞান",
    difficulty: "MEDIUM",
    subject: { nameBn: "ব্যাংক" },
    ecosystem: { code: "BANGLADESH_BANK" },
  };

  beforeEach(() => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([bankRow] as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (tx: unknown) => Promise<unknown>)(prisma),
    );
  });

  it("applies −0.25 per wrong MCQ for Bank questions", async () => {
    const summary = await submitPracticeAnswers("userA", [{ questionId: 21, selected: "খ" }]);
    expect(summary.wrong).toBe(1);
    expect(summary.penaltyPerWrong).toBe(0.25);
    expect(summary.negativeMarks).toBe(0.25);
    expect(summary.finalScore).toBe(-0.25);
  });

  it("applies −0.50 per wrong MCQ for BCS (explicit ecosystem)", async () => {
    vi.mocked(prisma.question.findMany).mockResolvedValue([{ ...bankRow, ecosystem: { code: "BCS" } }] as never);
    const summary = await submitPracticeAnswers(
      "userA",
      [{ questionId: 21, selected: "খ" }],
      "BCS",
    );
    expect(summary.penaltyPerWrong).toBe(0.5);
    expect(summary.negativeMarks).toBe(0.5);
    expect(summary.finalScore).toBe(-0.5);
  });
});

describe("createUser (atomic registration)", () => {
  it("creates user and initial progress inside one transaction", async () => {
    const passwordHash = await hash("password123", 10);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn) =>
      (fn as unknown as (tx: unknown) => Promise<unknown>)({
        user: prisma.user,
        userProgress: prisma.userProgress,
      }),
    );
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "u_new",
      name: "New",
      email: "new@x.dev",
      handle: "new",
      passwordHash,
      role: "STUDENT",
      createdAt: new Date(),
    } as never);
    vi.mocked(prisma.userProgress.create).mockResolvedValue({} as never);

    const record = await createUser({ name: "New", email: "new@x.dev", password: "password123" });

    expect(record.id).toBe("u_new");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.userProgress.create).toHaveBeenCalledWith({ data: { userId: "u_new" } });
  });

  it("maps a concurrent unique violation to a 409 conflict", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2002" });

    await expect(
      createUser({ name: "Dup", email: "dup@x.dev", password: "password123" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });
});

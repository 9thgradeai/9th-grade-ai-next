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

    expect(summary).toEqual({ correct: 1, total: 2, score: 50, pointsEarned: 10 });
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

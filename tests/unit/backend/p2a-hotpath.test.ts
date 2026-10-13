import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { prisma } from "~backend/db";
import {
  validateExamQuestionIds,
  validateExamDurationSec,
} from "~backend/validation";
import { getAllEcosystemSummaries } from "~backend/services/ecosystem";
import { submitExamAttempt } from "~backend/services/exam-submission";

const ATTEMPT_ID = "22222222-3333-4444-8555-666666666666";

function fullQuestion(id: number, correctAnswer: string) {
  return {
    id,
    subjectId: 1,
    ecosystemId: 1,
    topic: "ভাষা",
    subtopic: "বানান",
    question: `প্রশ্ন ${id}?`,
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer,
    explanation: "ব্যাখ্যা",
    difficulty: "MEDIUM",
    subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
    ecosystem: { code: "BCS" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("P2a — unified exam validators", () => {
  it("rejects an empty questionIds array (service + route contract)", () => {
    expect(() => validateExamQuestionIds([])).toThrow(/at least one question/);
  });

  it("dedupes questionIds into canonical set form", () => {
    expect(validateExamQuestionIds([3, 1, 3, 2, 1])).toEqual([3, 1, 2]);
  });

  it("rejects durationSec above the 6h ceiling", () => {
    expect(() => validateExamDurationSec(7 * 60 * 60)).toThrow(/6h ceiling/);
  });

  it("accepts a normal integer durationSec", () => {
    expect(validateExamDurationSec(600)).toBe(600);
  });
});

describe("P2a — batched ecosystem summaries", () => {
  it("issues 3 queries total and merges grouped counts", async () => {
    vi.mocked(prisma.examEcosystem.findMany).mockResolvedValue([
      { id: 1, code: "BCS", isActive: true, sortOrder: 0 },
      { id: 2, code: "BANGLADESH_BANK", isActive: true, sortOrder: 1 },
    ] as never);
    vi.mocked(prisma.subject.groupBy).mockResolvedValue([
      { ecosystemId: 1, _count: { _all: 9 } },
    ] as never);
    vi.mocked(prisma.question.groupBy).mockResolvedValue([
      { ecosystemId: 1, _count: { _all: 100 } },
      { ecosystemId: 2, _count: { _all: 50 } },
    ] as never);

    const rows = await getAllEcosystemSummaries();

    expect(prisma.examEcosystem.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.subject.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.question.groupBy).toHaveBeenCalledTimes(1);
    expect(rows).toMatchObject([
      { id: 1, subjectCount: 9, questionCount: 100 },
      // Missing groups default to zero, never undefined.
      { id: 2, subjectCount: 0, questionCount: 50 },
    ]);
  });
});

describe("P2a — post-commit points award", () => {
  it("still returns 'submitted' when the post-commit award write fails", async () => {
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      fullQuestion(1, "ক"),
    ] as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.mockTestResult.create).mockResolvedValue({ id: 99 } as never);
    vi.mocked(prisma.examAttempt.upsert).mockImplementation((async (args: never) => {
      const a = args as { create: { questionSetHash: string } };
      return {
        id: 1,
        userId: "user-1",
        idempotencyKey: ATTEMPT_ID,
        questionSetHash: a.create.questionSetHash,
        status: "SUBMITTING",
        durationSec: 60,
        startedAt: new Date(),
        submittedAt: null,
        summaryJson: null,
        resultId: null,
      } as never;
    }) as never);
    vi.mocked(prisma.examAttempt.update).mockResolvedValue({} as never);
    vi.mocked(prisma.userQuestionProgress.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (arg) => (arg as (tx: unknown) => Promise<unknown>)(prisma) as never,
    );
    // The award runs AFTER commit now — its failure must not fail grading.
    vi.mocked(prisma.$executeRaw).mockRejectedValueOnce(new Error("db down"));

    const result = await submitExamAttempt("user-1", {
      attemptId: ATTEMPT_ID,
      questionIds: [1],
      durationSec: 60,
      answers: [{ questionId: 1, selected: "ক" }],
    });

    expect(result.outcome).toBe("submitted");
    expect(result.summary.correct).toBe(1);
    expect(result.summary.pointsEarned).toBe(10);
  });
});

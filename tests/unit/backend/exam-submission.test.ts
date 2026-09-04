import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "~backend/db";
import { submitExamAttempt, registerExamAttempt } from "~backend/services/exam-submission";
import type { SubmittedAnswer } from "~backend/services/activity";

const ATTEMPT_ID = "11111111-2222-4333-8444-555555555555";
const HASH_FOR_1 = createHash("sha256").update("1").digest("hex");
const HASH_FOR_1_2_3 = createHash("sha256").update("1,2,3").digest("hex");

function fullQuestion(id: number, correctAnswer: string) {
  return {
    id,
    subjectId: 1,
    topic: "ভাষা",
    subtopic: "বানান",
    question: `প্রশ্ন ${id}?`,
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer,
    explanation: "ব্যাখ্যা",
    difficulty: "MEDIUM",
    subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitExamAttempt — canonical, idempotent submission", () => {
  it("rejects missing attemptId", async () => {
    await expect(
      submitExamAttempt("user-1", {
        attemptId: "",
        questionIds: [1],
        durationSec: 60,
        answers: [{ questionId: 1, selected: "ক" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects non-UUID attemptId", async () => {
    await expect(
      submitExamAttempt("user-1", {
        attemptId: "not-a-uuid",
        questionIds: [1],
        durationSec: 60,
        answers: [{ questionId: 1, selected: "ক" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects empty answers", async () => {
    await expect(
      submitExamAttempt("user-1", {
        attemptId: ATTEMPT_ID,
        questionIds: [],
        durationSec: 60,
        answers: [],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects negative durationSec", async () => {
    await expect(
      submitExamAttempt("user-1", {
        attemptId: ATTEMPT_ID,
        questionIds: [1],
        durationSec: -1,
        answers: [{ questionId: 1, selected: "ক" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects implausibly large durationSec", async () => {
    await expect(
      submitExamAttempt("user-1", {
        attemptId: ATTEMPT_ID,
        questionIds: [1],
        durationSec: 7 * 60 * 60,
        answers: [{ questionId: 1, selected: "ক" }],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("rejects when a referenced question does not exist", async () => {
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      fullQuestion(1, "ক"),
    ] as never);

    await expect(
      submitExamAttempt("user-1", {
        attemptId: ATTEMPT_ID,
        questionIds: [1, 999],
        durationSec: 60,
        answers: [
          { questionId: 1, selected: "ক" },
          { questionId: 999, selected: "ক" },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("grades BCS-style (+1 / −0.5 / 0), persists atomically, returns summary", async () => {
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      fullQuestion(1, "খ"),
      fullQuestion(2, "ক"),
      fullQuestion(3, "ঘ"),
    ] as never);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.mockTestResult.create).mockResolvedValue({ id: 99 } as never);
    // Mock upsert to echo back whatever it stored so the hash check passes.
    vi.mocked(prisma.examAttempt.upsert).mockImplementation(async (args) => {
      const a = args as { create: { questionSetHash: string }; update?: unknown };
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
    });
    vi.mocked(prisma.examAttempt.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (arg) =>
        (arg as (tx: unknown) => Promise<unknown>)(prisma) as never,
    );
    // Mock recordQuestionAttempt (transitively used) — it should run inside the
    // transaction. Return a fake feedback.
    vi.mocked(prisma.userQuestionProgress.findUnique).mockResolvedValue(null);

    const result = await submitExamAttempt("user-1", {
      attemptId: ATTEMPT_ID,
      questionIds: [1, 2, 3],
      durationSec: 60,
      answers: [
        { questionId: 1, selected: "খ" }, // correct +1
        { questionId: 2, selected: "গ" }, // wrong −0.5
        { questionId: 3, selected: "" }, // unanswered 0
      ],
    });

    expect(result.outcome).toBe("submitted");
    expect(result.summary).toMatchObject({
      total: 3,
      attempted: 2,
      correct: 1,
      wrong: 1,
      unanswered: 1,
      positiveMarks: 1,
      negativeMarks: 0.5,
      finalScore: 0.5,
      accuracy: 50,
    });
    expect(result.review[0].status).toBe("correct");
    expect(result.review[1].status).toBe("wrong");
    expect(result.review[2].status).toBe("unanswered");
  });

  it("is idempotent — a re-submit for an already-SUBMITTED attempt returns the original result with outcome 'resumed'", async () => {
    const existingSnapshot = {
      summary: {
        total: 1,
        attempted: 1,
        correct: 1,
        wrong: 0,
        unanswered: 0,
        positiveMarks: 1,
        negativeMarks: 0,
        finalScore: 1,
        accuracy: 100,
        percentage: 100,
        pointsEarned: 10,
      },
      review: [
        {
          questionId: 1,
          subject: "বাংলা ভাষা ও সাহিত্য",
          topic: "ভাষা",
          subtopic: "বানান",
          question: "প্রশ্ন 1?",
          options: ["ক", "খ"],
          correctAnswer: "ক",
          explanation: "",
          userAnswer: "ক",
          status: "correct" as const,
          marks: 1,
        },
      ],
    };
    const hashForQuestions = HASH_FOR_1;

    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
      id: 1,
      userId: "user-1",
      idempotencyKey: ATTEMPT_ID,
      questionSetHash: hashForQuestions,
      status: "SUBMITTED",
      durationSec: 60,
      startedAt: new Date(),
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
      summaryJson: existingSnapshot,
      resultId: 99,
      result: { id: 99 } as never,
    } as never);

    const result = await submitExamAttempt("user-1", {
      attemptId: ATTEMPT_ID,
      questionIds: [1],
      durationSec: 60,
      answers: [{ questionId: 1, selected: "ক" }],
    });

    expect(result.outcome).toBe("resumed");
    expect(result.summary.correct).toBe(1);
    expect(result.review[0].status).toBe("correct");
    // Critically — the transaction path was NOT run. No new QuestionAttempt
    // rows were created; no MockTestResult was created; UserProgress was not
    // recomputed.
    expect(prisma.questionAttempt.createMany).not.toHaveBeenCalled();
    expect(prisma.mockTestResult.create).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("rejects a SUBMITTED re-submit that uses a different question set (tampering)", async () => {
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
      id: 1,
      userId: "user-1",
      idempotencyKey: ATTEMPT_ID,
      questionSetHash: "original-hash",
      status: "SUBMITTED",
      durationSec: 60,
      startedAt: new Date(),
      submittedAt: new Date(),
      summaryJson: { summary: { total: 0 }, review: [] },
      resultId: 99,
    } as never);

    await expect(
      submitExamAttempt("user-1", {
        attemptId: ATTEMPT_ID,
        questionIds: [1, 2, 3, 4, 5], // different from the original
        durationSec: 60,
        answers: [{ questionId: 1, selected: "ক" }],
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "ATTEMPT_HASH_MISMATCH",
    });
  });
});

describe("registerExamAttempt", () => {
  it("rejects non-UUID attemptId", async () => {
    await expect(
      registerExamAttempt("user-1", "not-a-uuid", [1, 2]),
    ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });

  it("creates an IN_PROGRESS row for a fresh attempt", async () => {
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.examAttempt.upsert).mockResolvedValue({} as never);

    await registerExamAttempt("user-1", ATTEMPT_ID, [1, 2, 3]);

    const upsertCall = vi.mocked(prisma.examAttempt.upsert).mock.calls[0];
    expect(upsertCall?.[0]?.create).toMatchObject({
      userId: "user-1",
      idempotencyKey: ATTEMPT_ID,
      status: "IN_PROGRESS",
    });
  });

  it("is a no-op when an existing IN_PROGRESS row has the same question hash", async () => {
    const hash = HASH_FOR_1_2_3;
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
      status: "IN_PROGRESS",
      questionSetHash: hash,
    } as never);
    vi.mocked(prisma.examAttempt.upsert).mockResolvedValue({} as never);

    await registerExamAttempt("user-1", ATTEMPT_ID, [1, 2, 3]);

    const upsertCall = vi.mocked(prisma.examAttempt.upsert).mock.calls[0];
    expect(upsertCall?.[0]?.update).toEqual({ questionSetHash: hash });
  });
});

// Avoid an unused-import lint warning if SubmittedAnswer isn't otherwise used.
void ({} as SubmittedAnswer);
void Prisma;

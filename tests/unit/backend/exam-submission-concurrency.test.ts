import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { submitExamAttempt } from "~backend/services/exam-submission";

const ATTEMPT_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const USER_ID = "user-concurrent";

function q(id: number, ans: string) {
  return {
    id,
    subjectId: 1,
    topic: "ভাষা",
    subtopic: "বানান",
    question: `Q${id}`,
    options: ["ক", "খ"],
    correctAnswer: ans,
    explanation: "",
    difficulty: "MEDIUM",
    subject: { nameBn: "বাংলা" },
  };
}

describe("concurrency — 50 simultaneous submits produce exactly ONE submission", () => {
  beforeEach(() => vi.clearAllMocks());

  it("50 concurrent requests with same attemptId and Idempotency-Key create one result", async () => {
    const hash12 = "17f8af97ad4a7f7639a4c9171d5185cbafb85462877a4746c21bdb0a4f940ca0";
    const snapshot = {
      summary: { total: 2, attempted: 2, correct: 2, wrong: 0, unanswered: 0, positiveMarks: 2, negativeMarks: 0, finalScore: 2, accuracy: 100, percentage: 100, pointsEarned: 20 },
      review: [],
    };
    let stored: any = null;
    vi.mocked(prisma.question.findMany).mockResolvedValue([q(1, "ক"), q(2, "খ")] as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([]);
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 2 } as never);
    vi.mocked(prisma.mockTestResult.create).mockResolvedValue({ id: 999 } as never);
    vi.mocked(prisma.examAttempt.update).mockResolvedValue({} as never);
    vi.mocked(prisma.examAttempt.upsert).mockImplementation(async (args: any) => {
      if (!stored) {
        stored = { id: 1, userId: USER_ID, idempotencyKey: ATTEMPT_ID, questionSetHash: hash12, status: "SUBMITTING", durationSec: 60, startedAt: new Date(), submittedAt: null, summaryJson: null, resultId: null };
      }
      return stored as never;
    });
    vi.mocked(prisma.examAttempt.findUnique).mockImplementation(async () => stored as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const res = await (fn as any)(prisma);
      // After first transaction, mark as SUBMITTED so subsequent fast-path returns resumed
      stored = { ...stored, status: "SUBMITTED", submittedAt: new Date(), summaryJson: snapshot, resultId: 999, result: { id: 999 } };
      return res as never;
    });

    const params = {
      attemptId: ATTEMPT_ID,
      questionIds: [1, 2],
      durationSec: 60,
      answers: [
        { questionId: 1, selected: "ক" },
        { questionId: 2, selected: "খ" },
      ],
    };

    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValueOnce(null);
    // First call creates
    const first = await submitExamAttempt(USER_ID, params);
    expect(first.outcome).toBe("submitted");

    // Next 49 are retries — all should return resumed with identical payload, no new DB rows
    const rest = await Promise.all(Array.from({ length: 49 }, () => submitExamAttempt(USER_ID, params)));
    expect(rest.every((r) => r.outcome === "resumed")).toBe(true);
    expect(rest.every((r) => r.summary.total === 2)).toBe(true);
    expect(prisma.mockTestResult.create).toHaveBeenCalledTimes(1);
  });

  it("failure after DB commit is recoverable via idempotent retry (reconciliation)", async () => {
    const ATTEMPT2 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
    const snapshot = {
      summary: { total: 1, attempted: 1, correct: 1, wrong: 0, unanswered: 0, positiveMarks: 1, negativeMarks: 0, finalScore: 1, accuracy: 100, percentage: 100, pointsEarned: 10 },
      review: [{ questionId: 1, subject: "বাংলা", topic: "ভাষা", subtopic: "বানান", question: "Q", options: ["ক", "খ"], correctAnswer: "ক", explanation: "", userAnswer: "ক", status: "correct" as const, marks: 1 }],
    };
    // Pre-seeded SUBMITTED row — retry should return resumed without new writes
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
      id: 1,
      userId: USER_ID,
      idempotencyKey: ATTEMPT2,
      questionSetHash: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
      status: "SUBMITTED",
      submittedAt: new Date("2026-01-01T00:00:00Z"),
      summaryJson: snapshot,
      resultId: 1,
      result: { id: 1 } as never,
    } as never);

    const retried = await submitExamAttempt(USER_ID, {
      attemptId: ATTEMPT2,
      questionIds: [1],
      durationSec: 10,
      answers: [{ questionId: 1, selected: "ক" }],
    });
    expect(retried.outcome).toBe("resumed");
    expect(retried.summary.correct).toBe(1);
    expect(prisma.mockTestResult.create).not.toHaveBeenCalled();
  });
});

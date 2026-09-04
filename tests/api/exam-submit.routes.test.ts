// @vitest-environment node
//
// /api/exam/submit + /api/exam/start route tests.
// Exercises the HTTP seam — auth, validation, idempotency, error normalization.
// Node environment for jose signing.

import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { hash } from "bcryptjs";

import { POST as submitPOST } from "~app/api/exam/submit/route";
import { POST as startPOST } from "~app/api/exam/start/route";
import { signSession } from "~backend/auth";
import { resetRateLimitStore } from "~backend/rate-limit";
import { prisma } from "~backend/db";
import type { SubmittedAnswer } from "~backend/services/activity";

const BASE = "https://app.example.com";
const ATTEMPT_ID = "11111111-2222-4333-8444-555555555555";

function jsonRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function sessionCookie(): Promise<string> {
  const token = await signSession({ email: "submit@example.com", ver: 0 });
  return `auth_token=${token}`;
}

function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "usr_submit",
    name: "Submit User",
    email: "submit@example.com",
    handle: "submituser",
    passwordHash: "x",
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

const TEST_PASSWORD = "correct-horse-battery";
let passwordHashBcrypt: string;

beforeAll(async () => {
  passwordHashBcrypt = await hash(TEST_PASSWORD, 10);
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  await resetRateLimitStore();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.examAttempt.findUnique).mockReset();
  vi.mocked(prisma.examAttempt.upsert).mockReset();
  vi.mocked(prisma.examAttempt.update).mockReset();
  vi.mocked(prisma.question.findMany).mockReset();
  vi.mocked(prisma.questionAttempt.createMany).mockReset();
  vi.mocked(prisma.mockTestResult.create).mockReset();
  vi.mocked(prisma.$executeRaw).mockReset();
  vi.mocked(prisma.$transaction).mockReset();
  vi.mocked(prisma.userQuestionProgress.findUnique).mockReset();
});

async function setupAuthedUser() {
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: unknown) => {
    const a = args as { where: { id?: string; email?: string } };
    if (a.where.email === "submit@example.com" || a.where.id === "usr_submit") {
      return mockUser({ passwordHash: passwordHashBcrypt });
    }
    return null;
  }) as never);
}

describe("POST /api/exam/start", () => {
  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await startPOST(
      jsonRequest("/api/exam/start", {
        attemptId: ATTEMPT_ID,
        questionIds: [1, 2, 3],
      }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a valid attemptId + questionIds and returns IN_PROGRESS", async () => {
    await setupAuthedUser();
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.examAttempt.upsert).mockResolvedValue({} as never);

    const cookie = await sessionCookie();
    const res = await startPOST(
      jsonRequest(
        "/api/exam/start",
        { attemptId: ATTEMPT_ID, questionIds: [1, 2, 3] },
        { cookie },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { attemptId: string; status: string };
    expect(body.attemptId).toBe(ATTEMPT_ID);
    expect(body.status).toBe("IN_PROGRESS");
  });

  it("rejects a non-UUID attemptId with 400", async () => {
    await setupAuthedUser();
    const cookie = await sessionCookie();
    const res = await startPOST(
      jsonRequest(
        "/api/exam/start",
        { attemptId: "not-a-uuid", questionIds: [1] },
        { cookie },
      ),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty questionIds array with 400", async () => {
    await setupAuthedUser();
    const cookie = await sessionCookie();
    const res = await startPOST(
      jsonRequest(
        "/api/exam/start",
        { attemptId: ATTEMPT_ID, questionIds: [] },
        { cookie },
      ),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/exam/submit", () => {
  const answers: SubmittedAnswer[] = [
    { questionId: 1, selected: "খ" },
    { questionId: 2, selected: "" },
  ];

  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await submitPOST(
      jsonRequest("/api/exam/submit", {
        attemptId: ATTEMPT_ID,
        questionIds: [1, 2],
        durationSec: 60,
        answers,
      }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a fresh submission and returns outcome: submitted", async () => {
    await setupAuthedUser();
    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      {
        id: 1,
        subjectId: 1,
        topic: "ভাষা",
        subtopic: "বানান",
        question: "প্রশ্ন 1?",
        options: ["ক", "খ", "গ", "ঘ"],
        correctAnswer: "খ",
        explanation: "",
        difficulty: "MEDIUM",
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
      },
      {
        id: 2,
        subjectId: 1,
        topic: "ভাষা",
        subtopic: "বানান",
        question: "প্রশ্ন 2?",
        options: ["ক", "খ", "গ", "ঘ"],
        correctAnswer: "ক",
        explanation: "",
        difficulty: "MEDIUM",
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
      },
    ] as never);
    // Mock upsert to echo the hash that the service stored, so the hash check
    // inside the transaction passes.
    vi.mocked(prisma.examAttempt.upsert).mockImplementation(async (args) => {
      const a = args as { create: { questionSetHash: string }; update?: unknown };
      return {
        id: 1,
        userId: "usr_submit",
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
    vi.mocked(prisma.questionAttempt.createMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.mockTestResult.create).mockResolvedValue({ id: 42 } as never);
    vi.mocked(prisma.examAttempt.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      async (arg) =>
        (arg as (tx: unknown) => Promise<unknown>)(prisma) as never,
    );
    vi.mocked(prisma.userQuestionProgress.findUnique).mockResolvedValue(null);

    const cookie = await sessionCookie();
    const res = await submitPOST(
      jsonRequest(
        "/api/exam/submit",
        {
          attemptId: ATTEMPT_ID,
          questionIds: [1, 2],
          durationSec: 60,
          answers,
        },
        { cookie },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { outcome: string } };
    expect(body.result.outcome).toBe("submitted");
  });

  it("returns outcome: resumed for a duplicate submit with the same attemptId", async () => {
    await setupAuthedUser();
    const snapshot = {
      summary: {
        total: 2,
        attempted: 1,
        correct: 1,
        wrong: 0,
        unanswered: 1,
        positiveMarks: 1,
        negativeMarks: 0,
        finalScore: 1,
        accuracy: 100,
        percentage: 50,
        pointsEarned: 10,
      },
      review: [
        {
          questionId: 1,
          subject: "",
          topic: "",
          subtopic: "",
          question: "",
          options: [],
          correctAnswer: "খ",
          explanation: "",
          userAnswer: "খ",
          status: "correct" as const,
          marks: 1,
        },
      ],
    };
    // Build the same hash the service will compute for [1, 2]
    const crypto = await import("node:crypto");
    const hashHex = crypto.createHash("sha256").update("1,2").digest("hex");

    vi.mocked(prisma.examAttempt.findUnique).mockResolvedValue({
      id: 1,
      userId: "usr_submit",
      idempotencyKey: ATTEMPT_ID,
      questionSetHash: hashHex,
      status: "SUBMITTED",
      durationSec: 60,
      startedAt: new Date(),
      submittedAt: new Date("2026-01-01T00:00:00.000Z"),
      summaryJson: snapshot,
      resultId: 42,
      result: { id: 42 } as never,
    } as never);

    const cookie = await sessionCookie();
    const res = await submitPOST(
      jsonRequest(
        "/api/exam/submit",
        {
          attemptId: ATTEMPT_ID,
          questionIds: [1, 2],
          durationSec: 60,
          answers,
        },
        { cookie },
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { outcome: string } };
    expect(body.result.outcome).toBe("resumed");
    // Idempotent re-submit must NOT touch grading tables.
    expect(prisma.questionAttempt.createMany).not.toHaveBeenCalled();
    expect(prisma.mockTestResult.create).not.toHaveBeenCalled();
  });
});

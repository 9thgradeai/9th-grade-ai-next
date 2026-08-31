// @vitest-environment node
//
// Mistake-system route tests (tests/api/ per AGENTS.md contract).
// Exercises the HTTP seams — auth gates, validation, pagination — against the
// mocked Prisma client. Node environment for jose signing.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { hash } from "bcryptjs";

import { GET as mistakesGET } from "~app/api/mistakes/route";
import { GET as statsGET } from "~app/api/mistakes/stats/route";
import { GET as overallGET } from "~app/api/mistakes/stats/overall/route";
import { GET as examConfigGET } from "~app/api/mistakes/exam/config/route";
import { GET as subjectsGET } from "~app/api/mistakes/subjects/route";
import { POST as examPOST } from "~app/api/mistakes/exam/route";
import { signSession } from "~backend/auth";
import { resetRateLimitStore } from "~backend/rate-limit";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

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

const TEST_PASSWORD = "correct-horse-battery";
let passwordHashBcrypt: string;

async function sessionCookie(): Promise<string> {
  const token = await signSession({ email: "mistake@example.com", ver: 0 });
  return `auth_token=${token}`;
}

function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "usr_mistake",
    name: "Mistake User",
    email: "mistake@example.com",
    handle: "mistakeuser",
    passwordHash: passwordHashBcrypt,
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeAll(async () => {
  passwordHashBcrypt = await hash(TEST_PASSWORD, 10);
});

beforeEach(async () => {
  vi.unstubAllEnvs();
  await resetRateLimitStore();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.userProgress.findUnique).mockReset();
  vi.mocked(prisma.userQuestionProgress.findMany).mockReset();
  vi.mocked(prisma.userQuestionProgress.findUnique).mockReset();
  vi.mocked(prisma.userQuestionProgress.count).mockReset();
  vi.mocked(prisma.$queryRaw).mockReset();
  vi.mocked(prisma.aIUsage.aggregate).mockResolvedValue({
    _sum: { estimatedCostUsd: 0 },
    _count: 0,
    _avg: null,
    _min: null,
    _max: null,
  } as never);
});

describe("GET /api/mistakes", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await mistakesGET(getRequest("/api/mistakes"));
    expect(res.status).toBe(401);
  });

  it("returns paginated mistakes for an authenticated user", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);

    const mistakeRow = {
      id: 1,
      userId: "usr_mistake",
      questionId: 101,
      totalAttempts: 3,
      correctAttempts: 1,
      incorrectAttempts: 2,
      consecutiveCorrect: 0,
      consecutiveIncorrect: 0,
      mistakeCount: 2,
      masteryScore: 30,
      masteryStatus: "STRUGGLING",
      masteredAt: null,
      isMistake: true,
      firstIncorrectAt: new Date(),
      lastIncorrectAt: new Date(),
      lastCorrectAt: null,
      reviewCount: 0,
      lastReviewedAt: null,
      nextReviewAt: null,
      lastSubject: "Math",
      lastTopic: "Algebra",
      lastExam: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([
      {
        ...mistakeRow,
        question: {
          id: 101,
          subjectId: 1,
          topic: "Algebra",
          subtopic: "Linear Equation",
          question: "Which of the following...",
          options: ["a", "b", "c", "d"],
          correctAnswer: "a",
          explanation: "Because...",
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "BCS",
          subject: { nameBn: "Math" },
        },
      },
    ] as never);
    vi.mocked(prisma.userQuestionProgress.count).mockResolvedValue(1);

    const res = await mistakesGET(getRequest("/api/mistakes", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].mistakeCount).toBe(2);
    expect(body.data[0].masteryStatus).toBe("STRUGGLING");
    expect(body.data[0].question.subject).toBe("Math");
  });

  it("respects pagination params", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.userQuestionProgress.count).mockResolvedValue(45);

    const res = await mistakesGET(getRequest("/api/mistakes?page=3&limit=20", { cookie }));
    const body = await res.json();
    expect(body.page).toBe(3);
    expect(body.limit).toBe(20);
    expect(body.totalPages).toBe(3);
  });
});

describe("GET /api/mistakes/stats", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await statsGET(getRequest("/api/mistakes/stats"));
    expect(res.status).toBe(401);
  });

  it("returns mistake statistics for an authenticated user", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        totalMistakes: 12,
        unmastered: 8,
        struggling: 5,
        reviewing: 2,
        improving: 1,
        mastered: 4,
        totalAttempts: 30,
        totalCorrect: 12,
      },
    ] as never);

    const res = await statsGET(getRequest("/api/mistakes/stats", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalMistakes).toBe(12);
    expect(body.unmastered).toBe(8);
    expect(body.accuracy).toBe(40);
  });
});

describe("GET /api/mistakes/stats/overall", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await overallGET(getRequest("/api/mistakes/stats/overall"));
    expect(res.status).toBe(401);
  });

  it("returns overall answer-history accuracy/right/wrong for an authenticated user", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        totalAttempts: 120,
        totalCorrect: 84,
        totalWrong: 36,
        questionsAttempted: 25,
      },
    ] as never);

    const res = await overallGET(getRequest("/api/mistakes/stats/overall", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalAttempts).toBe(120);
    expect(body.totalCorrect).toBe(84);
    expect(body.totalWrong).toBe(36);
    expect(body.accuracy).toBe(70);
    expect(body.questionsAttempted).toBe(25);
  });

  it("returns zeroed stats when there is no attempt history", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      {
        totalAttempts: 0,
        totalCorrect: 0,
        totalWrong: 0,
        questionsAttempted: 0,
      },
    ] as never);

    const res = await overallGET(getRequest("/api/mistakes/stats/overall", { cookie }));
    const body = await res.json();
    expect(body.accuracy).toBe(0);
    expect(body.totalWrong).toBe(0);
  });
});

describe("GET /api/mistakes/exam/config", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await examConfigGET(getRequest("/api/mistakes/exam/config"));
    expect(res.status).toBe(401);
  });

  it("builds a mistake-scoped subject→topic→subtopic selection tree", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([
      {
        question: { subject: { nameBn: "Math" }, topic: "Algebra", subtopic: "Linear" },
      },
      {
        question: { subject: { nameBn: "Math" }, topic: "Algebra", subtopic: "Linear" },
      },
      {
        question: { subject: { nameBn: "Math" }, topic: "Algebra", subtopic: "Quadratics" },
      },
      {
        question: { subject: { nameBn: "English" }, topic: "Grammar", subtopic: "" },
      },
    ] as never);

    const res = await examConfigGET(getRequest("/api/mistakes/exam/config", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const math = body.subjects.find((s: { subject: string }) => s.subject === "Math");
    expect(math.count).toBe(3);
    const algebra = math.topics.find((t: { topic: string }) => t.topic === "Algebra");
    expect(algebra.count).toBe(3);
    const linear = algebra.subtopics.find((st: { subtopic: string }) => st.subtopic === "Linear");
    expect(linear.count).toBe(2);

    const english = body.subjects.find((s: { subject: string }) => s.subject === "English");
    expect(english.count).toBe(1);
  });

  it("returns empty subjects when the user has no mistakes", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);

    const res = await examConfigGET(getRequest("/api/mistakes/exam/config", { cookie }));
    const body = await res.json();
    expect(body.subjects).toEqual([]);
  });
});

describe("GET /api/mistakes/subjects", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await subjectsGET(getRequest("/api/mistakes/subjects"));
    expect(res.status).toBe(401);
  });

  it("returns subject mistake breakdown", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { subject: "Math", count: 24, unmastered: 20 },
      { subject: "English", count: 17, unmastered: 12 },
    ] as never);

    const res = await subjectsGET(getRequest("/api/mistakes/subjects", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subjects).toHaveLength(2);
    expect(body.subjects[0].subject).toBe("Math");
  });
});

describe("POST /api/mistakes/exam", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await examPOST(
      jsonRequest("/api/mistakes/exam", { count: 10 }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects invalid count", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    const res = await examPOST(
      jsonRequest("/api/mistakes/exam", { count: 0 }, { cookie }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no mistakes exist", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);

    const res = await examPOST(
      jsonRequest("/api/mistakes/exam", { count: 10 }, { cookie }),
    );
    expect(res.status).toBe(404);
  });

  it("builds a mistake exam filtered by topic preference", async () => {
    const cookie = await sessionCookie();
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([
      {
        questionId: 101,
        mistakeCount: 2,
        masteryScore: 30,
        lastIncorrectAt: null,
        nextReviewAt: null,
        totalAttempts: 3,
        question: { difficulty: "MEDIUM" },
      },
    ] as never);
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      {
        id: 101,
        subjectId: 1,
        topic: "Algebra",
        subtopic: "Linear",
        question: "Which of the following is linear?",
        options: ["a", "b", "c", "d"],
        correctAnswer: "c",
        explanation: "Linear equations have degree one.",
        difficulty: "MEDIUM",
        sourceExam: "BCS",
        year: null,
        subject: { nameBn: "Math" },
      },
    ] as never);

    const res = await examPOST(
      jsonRequest("/api/mistakes/exam", { count: 5, topic: "Algebra" }, { cookie }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.questions).toHaveLength(1);
    expect(body.result.questions[0].topic).toBe("Algebra");
    expect(body.result.questions[0].correctAnswer).toBe("c");
    expect(body.result.questions[0].explanation).toBe("Linear equations have degree one.");
  });
});

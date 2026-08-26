// @vitest-environment node
//
// Route-handler integration tests (tests/api/ per AGENTS.md contract).
// Exercises the actual HTTP seams — status codes, validation bounds, CSRF
// origin checks and auth gates — against the mocked Prisma client. Node
// environment: jose signing fails its cross-realm check inside jsdom.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { hash } from "bcryptjs";

import { POST as loginPOST } from "~app/api/auth/login/route";
import { POST as registerPOST } from "~app/api/auth/register/route";
import { GET as meGET } from "~app/api/auth/me/route";
import { POST as examSubmitPOST } from "~app/api/exam/submit/route";
import { POST as practiceSubmitPOST } from "~app/api/practice/submit/route";
import { POST as dailyQuizSubmitPOST } from "~app/api/daily-quiz/submit/route";
import { GET as wrongAnswersGET } from "~app/api/wrong-answers/route";
import { GET as weakTopicsGET } from "~app/api/weak-topics/route";
import { GET as leaderboardGET } from "~app/api/leaderboard/route";
import { GET as dailyQuizHistoryGET } from "~app/api/daily-quiz/history/route";
import { GET as questionsGET } from "~app/api/questions/route";
import { signSession } from "~backend/auth";
import { resetRateLimitStore } from "~backend/rate-limit";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

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

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

const TEST_PASSWORD = "correct-horse-battery";
let passwordHashBcrypt: string;

beforeAll(async () => {
  passwordHashBcrypt = await hash(TEST_PASSWORD, 10);
});

beforeEach(() => {
  vi.clearAllMocks();
  void resetRateLimitStore();
});

function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "usr_123",
    name: "Test Aspirant",
    email: "aspirant@example.com",
    handle: "aspirant",
    passwordHash: passwordHashBcrypt,
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function sessionCookieFor(email: string): Promise<string> {
  const token = await signSession({ email, ver: 0 });
  return `auth_token=${token}`;
}

// ── Auth routes ───────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("returns 200 + sets the session cookie on valid credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());

    const res = await loginPOST(
      jsonRequest("/api/auth/login", { email: "aspirant@example.com", password: TEST_PASSWORD }),
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("auth_token=");
    expect(setCookie).toContain("HttpOnly");
    const body = await res.json();
    expect(body.user.email).toBe("aspirant@example.com");
    expect(body.user.passwordHash).toBeUndefined();
  });

  it("returns 401 AUTH_INVALID_CREDENTIALS on a wrong password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());

    const res = await loginPOST(
      jsonRequest("/api/auth/login", { email: "aspirant@example.com", password: "wrong-password" }),
    );

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("returns 401 for an unknown email (timing-equalized path)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const res = await loginPOST(
      jsonRequest("/api/auth/login", { email: "nobody@example.com", password: TEST_PASSWORD }),
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR for malformed payloads", async () => {
    const res = await loginPOST(jsonRequest("/api/auth/login", { email: "not-an-email", password: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("throttles repeated attempts (429 RATE_LIMIT_EXCEEDED)", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    let lastRes: Response | null = null;
    for (let i = 0; i < 8; i++) {
      lastRes = await loginPOST(
        jsonRequest("/api/auth/login", { email: "hammer@example.com", password: TEST_PASSWORD }),
      );
    }
    expect(lastRes?.status).toBe(429);
    expect((await lastRes!.json()).code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("rejects cross-origin requests with 403 CSRF_ORIGIN_MISMATCH", async () => {
    const res = await loginPOST(
      jsonRequest(
        "/api/auth/login",
        { email: "a@b.com", password: TEST_PASSWORD },
        { origin: "https://evil.example.net" },
      ),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toMatch(/^CSRF_ORIGIN_/);
  });
});

describe("POST /api/auth/register", () => {
  it("creates a user and returns 201", async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce(null) // route uniqueness pre-check
      .mockResolvedValueOnce(null) // createUser internal re-check
      .mockResolvedValueOnce(mockUser()); // re-fetch after create
    vi.mocked(prisma.user.create).mockResolvedValue(mockUser());
    vi.mocked(prisma.userProgress.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    vi.mocked(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma),
    );

    const res = await registerPOST(
      jsonRequest("/api/auth/register", {
        name: "New Aspirant",
        email: "new@example.com",
        password: "strong-password-123",
      }),
    );

    expect([200, 201]).toContain(res.status);
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it("returns 409 when the email already exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());

    const res = await registerPOST(
      jsonRequest("/api/auth/register", {
        name: "Dup",
        email: "aspirant@example.com",
        password: "strong-password-123",
      }),
    );

    expect(res.status).toBe(409);
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without a session cookie", async () => {
    const res = await meGET(getRequest("/api/auth/me"));
    expect(res.status).toBe(401);
  });

  it("returns the safe user payload with a valid session", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());

    const res = await meGET(getRequest("/api/auth/me", { cookie }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("aspirant@example.com");
    expect(JSON.stringify(body)).not.toContain("passwordHash");
  });

  it("rejects a token whose version is stale (revoked session)", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser({ tokenVersion: 1 }));

    const res = await meGET(getRequest("/api/auth/me", { cookie }));
    expect(res.status).toBe(401);
  });
});

// ── Submission routes: bounds, auth, CSRF ─────────────────

function makeAnswers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ questionId: i + 1, selected: "A" }));
}

async function authedRequest(
  build: (cookie: string) => Request,
): Promise<Response> {
  const cookie = await sessionCookieFor("aspirant@example.com");
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
  return build(cookie);
}

describe("POST /api/exam/submit", () => {
  it("returns 401 unauthenticated", async () => {
    const res = await examSubmitPOST(jsonRequest("/api/exam/submit", { answers: makeAnswers(1) }));
    expect(res.status).toBe(401);
  });

  it("rejects empty answer arrays with 400", async () => {
    const res = await examSubmitPOST(await authedRequest((cookie) =>
      jsonRequest("/api/exam/submit", { answers: [] }, { cookie }),
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("caps oversized answer arrays at 200 entries (abuse guard)", async () => {
    const res = await examSubmitPOST(await authedRequest((cookie) =>
      jsonRequest("/api/exam/submit", { answers: makeAnswers(5000) }, { cookie }),
    ));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
  });

  it("rejects cross-origin submissions with 403", async () => {
    const res = await examSubmitPOST(
      jsonRequest(
        "/api/exam/submit",
        { answers: makeAnswers(1) },
        { origin: "https://evil.example.net" },
      ),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/practice/submit", () => {
  it("returns 401 unauthenticated", async () => {
    const res = await practiceSubmitPOST(jsonRequest("/api/practice/submit", { answers: makeAnswers(1) }));
    expect(res.status).toBe(401);
  });

  it("caps oversized answer arrays with 400", async () => {
    const res = await practiceSubmitPOST(await authedRequest((cookie) =>
      jsonRequest("/api/practice/submit", { answers: makeAnswers(1000) }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });

  it("rejects non-array answers with 400", async () => {
    const res = await practiceSubmitPOST(await authedRequest((cookie) =>
      jsonRequest("/api/practice/submit", { answers: "all-correct-please" }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/daily-quiz/submit", () => {
  it("requires an integer quizId", async () => {
    const res = await dailyQuizSubmitPOST(await authedRequest((cookie) =>
      jsonRequest("/api/daily-quiz/submit", { quizId: "today", answers: makeAnswers(1) }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });

  it("caps oversized answer arrays with 400", async () => {
    const res = await dailyQuizSubmitPOST(await authedRequest((cookie) =>
      jsonRequest("/api/daily-quiz/submit", { quizId: 1, answers: makeAnswers(500) }, { cookie }),
    ));
    expect(res.status).toBe(400);
  });
});

// ── Tier-1 read endpoints: auth gate + shape ──────────────

describe("GET /api/wrong-answers", () => {
  it("requires a session", async () => {
    const res = await wrongAnswersGET(getRequest("/api/wrong-answers"));
    expect(res.status).toBe(401);
  });

  it("returns the wrong-answer notebook for the caller", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ questionId: 5, correct: false }] as never);
    vi.spyOn(prisma.question, "findMany").mockResolvedValue([
      {
        id: 5, subjectId: 1, subject: { nameBn: "বাংলা" }, topic: "নাতিহ", subtopic: "",
        question: "q5", options: ["a", "b"], correctAnswer: "a", explanation: "e",
        difficulty: "EASY", year: null, sourceExam: "",
      },
    ] as never);
    vi.spyOn(prisma.question, "count").mockResolvedValue(1);

    const res = await wrongAnswersGET(getRequest("/api/wrong-answers", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.questions[0].id).toBe(5);
  });
});

describe("GET /api/weak-topics", () => {
  it("requires a session", async () => {
    expect((await weakTopicsGET(getRequest("/api/weak-topics"))).status).toBe(401);
  });

  it("returns ascending-accuracy weak topics", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([
      { subjectName: "বাংলা", topic: "নাতিহ", attempted: 10, correct: 3 },
      { subjectName: "ইতিহাস", topic: "মুক্তি", attempted: 4, correct: 2 },
    ] as never);

    const res = await weakTopicsGET(getRequest("/api/weak-topics", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topics[0].score).toBeLessThanOrEqual(body.topics[1].score);
  });
});

describe("GET /api/leaderboard", () => {
  it("requires a session", async () => {
    expect((await leaderboardGET(getRequest("/api/leaderboard"))).status).toBe(401);
  });

  it("returns ranked entries and the caller's rank", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.spyOn(prisma.userProgress, "findUnique").mockResolvedValue({ points: 50 } as never);
    vi.spyOn(prisma.userProgress, "findMany").mockResolvedValue([
      { points: 200, streak: 5, user: { name: "A", handle: "a" } },
      { points: 50, streak: 2, user: { name: "Me", handle: "me" } },
    ] as never);
    vi.spyOn(prisma.userProgress, "count").mockResolvedValue(1);

    const res = await leaderboardGET(getRequest("/api/leaderboard", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries[0]).toMatchObject({ rank: 1, points: 200 });
    expect(body.me).toEqual({ rank: 2, points: 50 });
  });
});

describe("GET /api/daily-quiz/history", () => {
  it("requires a session", async () => {
    expect((await dailyQuizHistoryGET(getRequest("/api/daily-quiz/history"))).status).toBe(401);
  });

  it("returns completed daily quizzes", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.spyOn(prisma.dailyQuizParticipation, "findMany").mockResolvedValue([
      {
        quizId: 1, score: 80, correct: 4, total: 5,
        completedAt: new Date("2026-01-01T10:00:00Z"),
        dailyQuiz: { date: new Date("2026-01-01T00:00:00Z") },
      },
    ] as never);

    const res = await dailyQuizHistoryGET(getRequest("/api/daily-quiz/history", { cookie }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history[0]).toMatchObject({ quizId: 1, score: 80 });
  });
});

describe("GET /api/questions — ids / year / sourceExam filters", () => {
  it("rejects unknown filter parameters", async () => {
    const res = await questionsGET(getRequest("/api/questions?bogus=1"));
    expect(res.status).toBe(400);
  });

  it("filters by year and sourceExam and returns matching questions", async () => {
    vi.spyOn(prisma.question, "findMany").mockResolvedValue([
      {
        id: 3, subjectId: 1, subject: { nameBn: "বাংলা" }, topic: "নাতিহ", subtopic: "",
        question: "pyq", options: ["a"], correctAnswer: "a", explanation: "", difficulty: "EASY",
        year: 2021, sourceExam: "45th BCS",
      },
    ] as never);
    vi.spyOn(prisma.question, "count").mockResolvedValue(1);

    const res = await questionsGET(getRequest("/api/questions?year=2021&sourceExam=45th%20BCS"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions[0].year).toBe(2021);
    expect(body.questions[0].sourceExam).toBe("45th BCS");
  });
});

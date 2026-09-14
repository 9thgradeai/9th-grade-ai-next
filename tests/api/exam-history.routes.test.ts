// @vitest-environment node
//
// /api/exam-history + /api/exam-papers + /api/real-exam/export route tests.
// Exercises the HTTP seam — auth gates, validation bounds, error normalization —
// against the mocked Prisma client. Node environment for jose signing.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { GET as historyGET } from "~app/api/exam-history/route";
import { GET as papersGET } from "~app/api/exam-papers/route";
import { GET as paperQuestionsGET } from "~app/api/exam-papers/[paperId]/route";
import { POST as exportPOST } from "~app/api/real-exam/export/route";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

function postRequest(
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

function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "usr_history",
    name: "History User",
    email: "history@example.com",
    handle: "historyuser",
    passwordHash: "x",
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

async function sessionCookie(): Promise<string> {
  const token = await signSession({ email: "history@example.com", ver: 0 });
  return `auth_token=${token}`;
}

function setupAuthedUser() {
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: unknown) => {
    const a = args as { where: { id?: string; email?: string } };
    if (a.where.email === "history@example.com" || a.where.id === "usr_history") {
      return mockUser();
    }
    return null;
  }) as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockReset();
  vi.mocked(prisma.examAttempt.findMany).mockReset();
  vi.mocked(prisma.mockTestResult.findMany).mockReset();
  vi.mocked(prisma.dailyQuizParticipation.findMany).mockReset();
  vi.mocked(prisma.examSchedule.findMany).mockReset();
  vi.mocked(prisma.examPaper.findMany).mockReset();
  vi.mocked(prisma.question.findMany).mockReset();
});

// ── GET /api/exam-history ────────────────────────────────────

describe("GET /api/exam-history", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await historyGET(getRequest("/api/exam-history"));
    expect(res.status).toBe(401);
  });

  it("returns past attempts and upcoming exams for an authed user", async () => {
    setupAuthedUser();
    vi.mocked(prisma.examAttempt.findMany).mockResolvedValue([
      {
        id: 1,
        userId: "usr_history",
        idempotencyKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        questionSetHash: "hash",
        status: "SUBMITTED",
        durationSec: 600,
        startedAt: new Date("2026-09-01T10:00:00Z"),
        submittedAt: new Date("2026-09-01T10:10:00Z"),
        examDurationSec: 900,
        summaryJson: null,
        resultId: 7,
        result: {
          id: 7,
          userId: "usr_history",
          mockTestId: null,
          score: 80,
          correct: 8,
          total: 10,
          durationSec: 600,
          createdAt: new Date("2026-09-01T10:10:00Z"),
          mockTest: null,
        },
      },
    ] as never);
    vi.mocked(prisma.mockTestResult.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dailyQuizParticipation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.examSchedule.findMany).mockResolvedValue([
      {
        id: 3,
        titleBn: "৪৭তম বিসিএস লিখিত",
        titleEn: "47th BCS Written",
        type: "BCS",
        date: new Date("2026-12-01T09:00:00Z"),
        year: "2026",
        circularNo: "47",
        note: "",
        sortOrder: 0,
        sourceUrl: "",
        verified: true,
        sourceKey: "k",
      },
    ] as never);

    const res = await historyGET(
      getRequest("/api/exam-history", { cookie: await sessionCookie() }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history.past).toHaveLength(1);
    expect(body.history.past[0].type).toBe("custom");
    expect(body.history.past[0].percentage).toBe(80);
    expect(body.history.upcoming).toHaveLength(1);
    expect(body.history.upcoming[0].titleBn).toBe("৪৭তম বিসিএস লিখিত");
    expect(body.history.upcoming[0].daysUntil).toBeGreaterThanOrEqual(0);
  });

  it("returns empty lists when the user has no history", async () => {
    setupAuthedUser();
    vi.mocked(prisma.examAttempt.findMany).mockResolvedValue([]);
    vi.mocked(prisma.mockTestResult.findMany).mockResolvedValue([]);
    vi.mocked(prisma.dailyQuizParticipation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.examSchedule.findMany).mockResolvedValue([]);

    const res = await historyGET(
      getRequest("/api/exam-history", { cookie: await sessionCookie() }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history.past).toEqual([]);
    expect(body.history.upcoming).toEqual([]);
  });
});

// ── GET /api/exam-papers ─────────────────────────────────────

describe("GET /api/exam-papers", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await papersGET(getRequest("/api/exam-papers"));
    expect(res.status).toBe(401);
  });

  it("returns available papers for an authed user", async () => {
    setupAuthedUser();
    vi.mocked(prisma.examPaper.findMany).mockResolvedValue([
      {
        id: 1,
        examId: 2,
        slug: "46th-bcs-preliminary",
        titleBn: "৪৬তম বিসিএস প্রিলিমিনারি",
        titleEn: "46th BCS Preliminary",
        bcsTerm: 46,
        termLabel: "46th",
        year: 2024,
        heldOn: null,
        durationMin: 120,
        totalQuestions: 200,
        availableQuestions: 50,
        source: "",
        provenance: "CURATED",
        verified: true,
        sortOrder: 0,
        exam: {
          id: 2,
          nameBn: "বিসিএস প্রিলিমিনারি",
          nameEn: "BCS Preliminary",
          type: "PRELIMINARY",
          category: { id: 1, nameBn: "বিসিএস" },
        },
        questions: [
          { id: 1, subjectId: 3, subject: { nameBn: "বাংলা" } },
        ],
      },
    ] as never);

    const res = await papersGET(
      getRequest("/api/exam-papers", { cookie: await sessionCookie() }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.papers).toHaveLength(1);
    expect(body.papers[0].titleBn).toBe("৪৬তম বিসিএস প্রিলিমিনারি");
    expect(body.papers[0].availableQuestions).toBe(50);
  });
});

// ── GET /api/exam-papers/[paperId] ───────────────────────────

describe("GET /api/exam-papers/[paperId]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await paperQuestionsGET(getRequest("/api/exam-papers/1"), {
      params: Promise.resolve({ paperId: "1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for a non-numeric paper id", async () => {
    setupAuthedUser();
    const res = await paperQuestionsGET(
      getRequest("/api/exam-papers/abc", { cookie: await sessionCookie() }),
      { params: Promise.resolve({ paperId: "abc" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns questions for a valid paper", async () => {
    setupAuthedUser();
    vi.mocked(prisma.question.findMany).mockResolvedValue([
      {
        id: 1,
        subjectId: 3,
        subject: { nameBn: "বাংলা ভাষা ও সাহিত্য" },
        topic: "ভাষা",
        subtopic: "বানান",
        question: "শুদ্ধ বানান কোনটি?",
        options: ["ক", "খ", "গ", "ঘ"],
        correctAnswer: "ক",
        explanation: "কারণ",
        difficulty: "EASY",
        year: 2024,
        sourceExam: "46th BCS",
        questionNumber: 1,
      },
    ] as never);

    const res = await paperQuestionsGET(
      getRequest("/api/exam-papers/1", { cookie: await sessionCookie() }),
      { params: Promise.resolve({ paperId: "1" }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].correctAnswer).toBe("ক");
  });
});

// ── POST /api/real-exam/export ───────────────────────────────

const EXPORT_QUESTIONS = [
  {
    id: 1,
    question: "What is the capital of Bangladesh?",
    options: ["Dhaka", "Chittagong", "Khulna", "Rajshahi"],
    correctAnswer: "Dhaka",
    explanation: "Dhaka has been the capital since 1971.",
    subject: "General Knowledge",
    topic: "Bangladesh",
    subtopic: "Capitals",
    difficulty: "EASY" as const,
  },
];

function exportBody(overrides: Record<string, unknown> = {}) {
  return {
    questions: EXPORT_QUESTIONS,
    title: "Test Paper",
    examName: "Test Exam",
    exportOptions: { includeAnswers: false, includeExplanations: false, shuffleQuestions: false },
    durationMin: 60,
    ...overrides,
  };
}

describe("POST /api/real-exam/export", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await exportPOST(postRequest("/api/real-exam/export", exportBody()));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no questions are provided", async () => {
    setupAuthedUser();
    const res = await exportPOST(
      postRequest("/api/real-exam/export", exportBody({ questions: [] }), {
        cookie: await sessionCookie(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns a PDF without answers by default", async () => {
    setupAuthedUser();
    const res = await exportPOST(
      postRequest("/api/real-exam/export", exportBody(), {
        cookie: await sessionCookie(),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
    // PDF magic header
    const head = Buffer.from(buf).subarray(0, 5).toString("latin1");
    expect(head).toBe("%PDF-");
  });

  it("returns a PDF with answers and explanations when requested", async () => {
    setupAuthedUser();
    const res = await exportPOST(
      postRequest(
        "/api/real-exam/export",
        exportBody({
          exportOptions: { includeAnswers: true, includeExplanations: true, shuffleQuestions: true },
        }),
        { cookie: await sessionCookie() },
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
  });

  it("returns 400 when more than 200 questions are provided", async () => {
    setupAuthedUser();
    const many = Array.from({ length: 201 }, (_, i) => ({ ...EXPORT_QUESTIONS[0], id: i + 1 }));
    const res = await exportPOST(
      postRequest("/api/real-exam/export", exportBody({ questions: many }), {
        cookie: await sessionCookie(),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("exports Bengali questions with null answer/explanation/option entries", async () => {
    setupAuthedUser();
    const res = await exportPOST(
      postRequest(
        "/api/real-exam/export",
        exportBody({
          questions: [
            {
              id: 7,
              question: "বাংলাদেশের রাজধানী কোনটি? গীতাঞ্জলির রচয়িতা কে এবং শুদ্ধ বানান কোনটি — এই প্রশ্নটি অনেক লম্বা করে লেখা হলো যাতে লাইন ভাঙা পরীক্ষা করা যায়।",
              options: ["ঢাকা", null, "", "চট্টগ্রাম", "খুলনা"],
              correctAnswer: null,
              explanation: null,
              subject: "সাধারণ জ্ঞান",
              topic: "বাংলাদেশ",
              subtopic: "রাজধানী",
              difficulty: "EASY",
              year: null,
              sourceExam: null,
            },
          ],
          title: "কাস্টম রিয়েল এক্সাম প্রশ্নপত্র",
          examName: "বাংলা ভাষা ও সাহিত্য",
          exportOptions: { includeAnswers: true, includeExplanations: true, shuffleQuestions: false },
        }),
        { cookie: await sessionCookie() },
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
    const head = Buffer.from(buf).subarray(0, 5).toString("latin1");
    expect(head).toBe("%PDF-");
  });

  it("tolerates missing exportOptions/title/durationMin", async () => {
    setupAuthedUser();
    const res = await exportPOST(
      postRequest(
        "/api/real-exam/export",
        { questions: EXPORT_QUESTIONS },
        { cookie: await sessionCookie() },
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
  });

  it("returns 400 for a malformed JSON body", async () => {
    setupAuthedUser();
    const bad = new Request(`${BASE}/api/real-exam/export`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: await sessionCookie() },
      body: "{not-json",
    });
    const res = await exportPOST(bad);
    expect(res.status).toBe(400);
  });

  it("survives hostile rows: control chars, lone surrogates, non-objects", async () => {
    setupAuthedUser();
    const res = await exportPOST(
      postRequest(
        "/api/real-exam/export",
        exportBody({
          questions: [
            {
              id: 1,
              question: "line1\x00line2\x01\x02 এবং lone surrogate � end",
              options: ["\uD800 alone", "ok \u{1F600} emoji", 42 as unknown as string, ""],
              correctAnswer: "ok \u{1F600} emoji",
              explanation: "expl\x7F with \uDC00 stray",
              subject: "বাংলা",
              topic: "t",
              subtopic: "t",
              difficulty: "HARD",
            },
            "not-an-object" as unknown as Record<string, unknown>,
            null as unknown as Record<string, unknown>,
          ],
          exportOptions: { includeAnswers: true, includeExplanations: true, shuffleQuestions: true },
        }),
        { cookie: await sessionCookie() },
      ),
    );

    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(500);
    const head = Buffer.from(buf).subarray(0, 5).toString("latin1");
    expect(head).toBe("%PDF-");
  });

  it("exports a full 200-question Bengali paper", async () => {
    setupAuthedUser();
    const many = Array.from({ length: 200 }, (_, i) => ({
      ...EXPORT_QUESTIONS[0],
      id: i + 1,
      question: `প্রশ্ন ${i + 1}: বাংলাদেশের রাজধানী কোনটি? গীতাঞ্জলির রচয়িতা কে?`,
      options: ["ঢাকা", "চট্টগ্রাম", "খুলনা", "রাজশাহী"],
      correctAnswer: "ঢাকা",
      explanation: "ব্যাখ্যা: ঢাকা ১৯৭১ সাল থেকে রাজধানী।",
      subject: "সাধারণ জ্ঞান",
    }));
    const res = await exportPOST(
      postRequest("/api/real-exam/export", exportBody({ questions: many }), {
        cookie: await sessionCookie(),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(5000);
  });
});

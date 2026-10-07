// @vitest-environment node
//
// GET /api/spotlight — Home-tab rotating MCQ (database reads only).
// Verifies the HTTP seam: batch shape, count bounds, exclusion plumbing.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET as spotlightGET } from "~app/api/spotlight/route";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function getRequest(path: string): Request {
  return new Request(`${BASE}${path}`, { method: "GET" });
}

function spotlightRow(id: number, subjectId: number) {
  return {
    id,
    subjectId,
    ecosystemId: 1,
    subject: { nameBn: subjectId === 1 ? "বাংলা" : "English" },
    topic: "টি",
    subtopic: "",
    question: `প্রশ্ন ${id}?`,
    options: ["ক", "খ", "গ", "ঘ"],
    correctAnswer: "ক",
    explanation: "",
    difficulty: "MEDIUM",
    year: null,
    sourceExam: "BCS",
    bcsTerm: null,
    questionType: "SINGLE_CHOICE",
    correctAnswers: [],
    statements: [],
    media: [],
    paperId: null,
    examId: null,
    questionNumber: null,
    rawMath: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.subject.findMany).mockResolvedValue([{ id: 1 }, { id: 2 }] as never);
  vi.mocked(prisma.question.groupBy).mockResolvedValue([
    { subjectId: 1, _count: { _all: 10 } },
    { subjectId: 2, _count: { _all: 10 } },
  ] as never);
  vi.mocked(prisma.question.count).mockResolvedValue(10);
  let nextId = 1;
  vi.mocked(prisma.question.findMany).mockImplementation((async (args: never) => {
    const { where, take } = args as { where?: { subjectId?: number }; take?: number };
    const n = Math.max(1, take ?? 1);
    const rows = [];
    for (let k = 0; k < n; k++) rows.push(spotlightRow(nextId++, where?.subjectId ?? 1));
    return rows as never;
  }) as never);
});

describe("GET /api/spotlight", () => {
  it("returns a random cross-subject batch of database questions", async () => {
    const res = await spotlightGET(getRequest("/api/spotlight?count=4"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.questions).toHaveLength(4);
    expect(new Set(body.questions.map((q: { subjectId: number }) => q.subjectId)).size).toBe(2);
    // Full DTOs (question + options + answer) — the client grades locally.
    expect(body.questions[0]).toMatchObject({
      question: expect.any(String),
      options: expect.any(Array),
      correctAnswer: expect.any(String),
    });
  });

  it("is never cached (freshly random per call)", async () => {
    const res = await spotlightGET(getRequest("/api/spotlight?count=2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("forwards exclusions so cycles never repeat shown questions", async () => {
    const res = await spotlightGET(getRequest("/api/spotlight?count=2&exclude=5,9"));
    expect(res.status).toBe(200);
    const calls = vi.mocked(prisma.question.findMany).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const where = (call[0] as { where?: { id?: { notIn?: number[] } } }).where;
      expect(where?.id?.notIn).toEqual(expect.arrayContaining([5, 9]));
    }
  });
});

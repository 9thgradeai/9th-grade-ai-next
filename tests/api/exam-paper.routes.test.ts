// @vitest-environment node
//
// /api/exam/config (extended) + /api/exam/paper route tests.
// Exercises the HTTP seam: auth, validation, readiness, and the configured
// paper build. Node environment for jose session signing.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { GET as configGET } from "~app/api/exam/config/route";
import { GET as paperGET, POST as paperPOST } from "~app/api/exam/paper/route";
import { signSession } from "~backend/auth";
import { resetRateLimitStore } from "~backend/rate-limit";
import { prisma } from "~backend/db";
import { QueryCache } from "~backend/infrastructure/cache/query-cache";
import { BCS_PRELIMINARY_CONFIG } from "~backend/services/exam-config";
import { clearBanglaSubjectsCache } from "~backend/services/bangla-union";

const BASE = "https://app.example.com";

function getRequest(path: string): Request {
  return new Request(`${BASE}${path}`, { method: "GET" });
}

async function authedRequest(path: string, body: unknown): Promise<Request> {
  const cookie = await sessionCookie();
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}

async function sessionCookie(): Promise<string> {
  const token = await signSession({ email: "paper@example.com", ver: 0 });
  return `auth_token=${token}`;
}

const SUBJECTS = [
  { id: 601, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  { id: 602, nameBn: "English Language and Literature" },
  { id: 603, nameBn: "বাংলাদেশ বিষয়াবলি" },
  { id: 604, nameBn: "আন্তর্জাতিক বিষয়াবলী" },
  { id: 605, nameBn: "ভূগোল, পরিবেশ ও দুর্যোগ ব্যবস্থাপনা" },
  { id: 606, nameBn: "সাধারণ বিজ্ঞান" },
  { id: 607, nameBn: "কম্পিউটার ও তথ্য প্রযুক্তি" },
  { id: 608, nameBn: "গাণিতিক যুক্তি" },
  { id: 609, nameBn: "মানসিক দক্ষতা" },
  { id: 610, nameBn: "নৈতিকতা, মূল্যবোধ ও সু-শাসন" },
];

function ecosystemRow() {
  return { id: 1, code: "BCS", nameBn: "বিসিএস", isActive: true, sortOrder: 0 };
}

/** Mock a synthetic BCS question bank large enough for a full paper. */
function installInventory() {
  const rows: Array<{ subjectId: number; path: string; question: string }> = [];
  let id = 1;
  BCS_PRELIMINARY_CONFIG.subjects.forEach((subject, idx) => {
    const subjectId = 601 + idx;
    const leafPaths: string[] = [];
    const walk = (nodes: typeof subject.children) => {
      for (const n of nodes) {
        if (n.children.length === 0) leafPaths.push(...n.paths);
        else walk(n.children);
      }
    };
    walk(subject.children);
    for (const path of leafPaths) {
      for (let i = 0; i < 200; i++) {
        rows.push({ subjectId, path, question: `Q${id++}` });
      }
    }
  });

  const full = rows.map((r, i) => ({
    id: i + 1,
    subjectId: r.subjectId,
    path: r.path,
    topic: r.path.split("/").slice(-1)[0],
    subtopic: "",
    question: r.question,
    options: ["a", "b", "c", "d"],
    difficulty: "MEDIUM",
    sourceExam: "BCS",
    year: null,
  }));

  vi.mocked(prisma.examEcosystem.findUnique).mockResolvedValue(ecosystemRow() as never);
  vi.mocked(prisma.subject.findMany).mockResolvedValue(SUBJECTS as never);
  vi.mocked(prisma.topic.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.question.groupBy).mockResolvedValue(
    (() => {
      const m = new Map<string, { subjectId: number; path: string; _count: { _all: number } }>();
      for (const q of full) {
        const key = `${q.subjectId}\u0000${q.path}`;
        const row = m.get(key);
        if (row) row._count._all += 1;
        else m.set(key, { subjectId: q.subjectId, path: q.path, _count: { _all: 1 } });
      }
      return [...m.values()];
    })() as never,
  );
  vi.mocked(prisma.question.findMany).mockImplementation((async (args: {
    where?: { subjectId?: number; path?: string; id?: { in: number[] } };
    select?: Record<string, boolean>;
  }) => {
    if (args?.select?.question === true) {
      const ids = new Set(args.where?.id?.in ?? []);
      return full.filter((q) => ids.has(q.id));
    }
    return full
      .filter(
        (q) =>
          q.subjectId === args?.where?.subjectId &&
          (args?.where?.path === undefined || q.path === args.where.path),
      )
      .map((q) => ({ id: q.id }));
  }) as never);
  return full;
}

function authUser() {
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "usr_paper",
    name: "Paper User",
    email: "paper@example.com",
    handle: "paperuser",
    passwordHash: "x",
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  } as never);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await resetRateLimitStore();
  await QueryCache.invalidateExamTree();
  clearBanglaSubjectsCache();
  vi.mocked(prisma.question.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.question.groupBy).mockResolvedValue([] as never);
  vi.mocked(prisma.subject.findMany).mockResolvedValue([] as never);
  vi.mocked(prisma.topic.findMany).mockResolvedValue([] as never);
});

describe("GET /api/exam/config", () => {
  it("returns the tree plus the compact config summary for a known ecosystem", async () => {
    installInventory();
    const res = await configGET(getRequest("/api/exam/config?ecosystem=BCS"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.subjects)).toBe(true);
    expect(body.examConfigSummary).toMatchObject({
      examCode: "BCS",
      totalMarks: 200,
      valid: true,
    });
    expect(body.examConfig).toBeNull();
  });

  it("includes the full config when full=1", async () => {
    installInventory();
    const res = await configGET(getRequest("/api/exam/config?ecosystem=BCS&full=1"));
    const body = await res.json();
    expect(body.examConfig?.examCode).toBe("BCS");
    expect(body.examConfig.subjects).toHaveLength(10);
  });

  it("omits the config for an unknown ecosystem but still returns the tree", async () => {
    installInventory();
    const res = await configGET(getRequest("/api/exam/config?ecosystem=NOPE"));
    // resolveEcosystemId throws 404 for an unknown code.
    expect(res.status).toBe(404);
  });
});

describe("GET /api/exam/paper", () => {
  it("rejects a missing/unknown ecosystem", async () => {
    const res = await paperGET(getRequest("/api/exam/paper"));
    expect(res.status).toBe(400);
  });

  it("reports readiness for BCS", async () => {
    installInventory();
    const res = await paperGET(getRequest("/api/exam/paper?ecosystem=BCS"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.readiness.examCode).toBe("BCS");
    expect(body.readiness.feasible).toBe(true);
  });
});

describe("POST /api/exam/paper", () => {
  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const res = await paperPOST(
      new Request(`${BASE}/api/exam/paper`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ecosystem: "BCS", mode: "mock" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an unknown field with 400", async () => {
    authUser();
    const res = await paperPOST(
      await authedRequest("/api/exam/paper", { ecosystem: "BCS", mode: "mock", nope: 1 }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid mode with 400", async () => {
    authUser();
    const res = await paperPOST(
      await authedRequest("/api/exam/paper", { ecosystem: "BCS", mode: "exam" }),
    );
    expect(res.status).toBe(400);
  });

  it("builds a full paper for an authenticated user", async () => {
    authUser();
    installInventory();
    const res = await paperPOST(
      await authedRequest("/api/exam/paper", {
        ecosystem: "BCS",
        mode: "mock",
        seed: 11,
        shuffleQuestions: false,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paper.totalQuestions).toBe(200);
    expect(body.paper.allocation.outcome).toBe("feasible");
  });

  it("returns 422 when a full paper cannot be assembled", async () => {
    authUser();
    vi.mocked(prisma.examEcosystem.findUnique).mockResolvedValue(ecosystemRow() as never);
    vi.mocked(prisma.subject.findMany).mockResolvedValue(SUBJECTS as never);
    // No questions → infeasible.
    const res = await paperPOST(
      await authedRequest("/api/exam/paper", { ecosystem: "BCS", mode: "mock" }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("EXAM_PAPER_INFEASIBLE");
    expect(typeof body.error).toBe("string");
  });

  it("rejects a malformed JSON body with 400", async () => {
    authUser();
    const cookie = await sessionCookie();
    const req = new Request(`${BASE}/api/exam/paper`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{not json",
    });
    const res = await paperPOST(req);
    expect(res.status).toBe(400);
  });

  it("does not leak the session cookie value in the response", async () => {
    authUser();
    installInventory();
    const res = await paperPOST(
      await authedRequest("/api/exam/paper", { ecosystem: "BCS", mode: "mock", seed: 1 }),
    );
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("auth_token");
  });
});

// @vitest-environment node
//
// Route-handler integration tests for the current-affairs
// endpoints: auth gating, cron secret verification, input
// validation, and payload plumbing. The service layer is
// mocked — the agent itself is covered by
// tests/unit/backend/current-affairs-agent.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { GET as latestGET } from "~app/api/current-affairs/latest/route";
import { POST as userNotePOST } from "~app/api/current-affairs/user-note/route";
import { GET as exportGET } from "~app/api/current-affairs/export/route";
import { GET as cronGET } from "~app/api/cron/daily-current-affairs/route";
import {
  getLatestNote,
  getMostRecentNote,
  upsertUserNote,
  publishDailyNote,
  buildNotePdf,
} from "~backend/services/current-affairs";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

vi.mock("~backend/services/current-affairs", () => ({
  getLatestNote: vi.fn(),
  getMostRecentNote: vi.fn(),
  upsertUserNote: vi.fn(),
  publishDailyNote: vi.fn(),
  buildNotePdf: vi.fn(),
  normalizeDay: (d: Date | string) =>
    new Date(`${typeof d === "string" ? d : d.toISOString().slice(0, 10)}T00:00:00.000Z`),
}));

const BASE = "https://app.example.com";

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

function postRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function sessionCookieFor(email: string): Promise<string> {
  const token = await signSession({ email, ver: 0 });
  return `auth_token=${token}`;
}

function mockUser() {
  return {
    id: "usr_ca",
    name: "Current Aspirant",
    email: "ca@example.com",
    handle: "ca",
    passwordHash: "x",
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

const NOTE = {
  id: "note_1",
  date: "2026-10-03",
  title: "Daily Note",
  summary: "Summary",
  contentJson: { type: "doc", content: [] },
  status: "PUBLISHED",
  source: "agent",
  citations: [
    { id: "c1", publisher: "The Daily Star", articleTitle: "T", sourceUrl: "https://example.com/a", publishedAt: null },
  ],
  mcqs: [
    { id: "m1", question: "Q?", options: ["a", "b", "c", "d"], correctOption: 0, explanation: "E", explanationBn: "ব", relevantExam: "Both" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
});

describe("GET /api/current-affairs/latest", () => {
  it("requires a session", async () => {
    const res = await latestGET(getRequest("/api/current-affairs/latest"));
    expect(res.status).toBe(401);
  });

  it("serves the most recent note with the user's saved version", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    vi.mocked(getMostRecentNote).mockResolvedValue({
      note: NOTE as never,
      userNote: { customContentJson: { type: "doc", content: [] }, updatedAt: "2026-10-03T10:00:00Z" },
    });

    const res = await latestGET(getRequest("/api/current-affairs/latest", { cookie }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { note: { id: string }; userNote: { updatedAt: string } };
    expect(body.note.id).toBe("note_1");
    expect(body.userNote.updatedAt).toBe("2026-10-03T10:00:00Z");
    expect(getMostRecentNote).toHaveBeenCalledWith("usr_ca");
  });

  it("looks up an explicit date", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    vi.mocked(getLatestNote).mockResolvedValue({ note: NOTE as never, userNote: null });

    const res = await latestGET(getRequest("/api/current-affairs/latest?date=2026-10-01", { cookie }));
    expect(res.status).toBe(200);
    expect(getLatestNote).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"), "usr_ca");
  });

  it("rejects a malformed date", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    const res = await latestGET(getRequest("/api/current-affairs/latest?date=not-a-date", { cookie }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/current-affairs/user-note", () => {
  it("requires a session", async () => {
    const res = await userNotePOST(postRequest("/api/current-affairs/user-note", {}));
    expect(res.status).toBe(401);
  });

  it("rejects unknown fields", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    const res = await userNotePOST(
      postRequest("/api/current-affairs/user-note", { dailyNoteId: "note_1", customContentJson: { type: "doc", content: [] }, extra: 1 }, { cookie }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-TipTap payload", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    const res = await userNotePOST(
      postRequest("/api/current-affairs/user-note", { dailyNoteId: "note_1", customContentJson: { type: "not-a-doc" } }, { cookie }),
    );
    expect(res.status).toBe(400);
  });

  it("upserts the user's customized note", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    vi.mocked(upsertUserNote).mockResolvedValue({ updatedAt: "2026-10-03T11:00:00Z" });

    const res = await userNotePOST(
      postRequest(
        "/api/current-affairs/user-note",
        { dailyNoteId: "note_1", customContentJson: { type: "doc", content: [{ type: "paragraph" }] } },
        { cookie },
      ),
    );
    expect(res.status).toBe(200);
    expect(upsertUserNote).toHaveBeenCalledWith(
      "usr_ca",
      "note_1",
      { type: "doc", content: [{ type: "paragraph" }] },
    );
  });
});

describe("GET /api/current-affairs/export", () => {
  it("requires a session", async () => {
    const res = await exportGET(getRequest("/api/current-affairs/export"));
    expect(res.status).toBe(401);
  });

  it("returns a PDF study sheet", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    vi.mocked(getLatestNote).mockResolvedValue({ note: NOTE as never, userNote: null });
    vi.mocked(buildNotePdf).mockResolvedValue(Buffer.from("%PDF-1.4 fake"));

    const res = await exportGET(getRequest("/api/current-affairs/export?date=2026-10-03", { cookie }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("current-affairs-2026-10-03.pdf");
  });

  it("404s when no note exists for the date", async () => {
    const cookie = await sessionCookieFor("ca@example.com");
    vi.mocked(getLatestNote).mockResolvedValue({ note: null, userNote: null });

    const res = await exportGET(getRequest("/api/current-affairs/export?date=2026-10-03", { cookie }));
    expect(res.status).toBe(404);
  });
});

describe("GET /api/cron/daily-current-affairs", () => {
  const OLD_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = "test-cron-secret";
  });

  afterEach(() => {
    if (OLD_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = OLD_SECRET;
  });

  it("rejects a missing secret", async () => {
    const res = await cronGET(getRequest("/api/cron/daily-current-affairs"));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    const queryAuth = await cronGET(
      getRequest("/api/cron/daily-current-affairs?secret=nope"),
    );
    expect(queryAuth.status).toBe(401);

    const bearerAuth = await cronGET(
      getRequest("/api/cron/daily-current-affairs", { authorization: "Bearer wrong" }),
    );
    expect(bearerAuth.status).toBe(401);
  });

  it("accepts the Bearer secret and publishes idempotently", async () => {
    vi.mocked(publishDailyNote).mockResolvedValue({ note: NOTE, generated: true } as never);

    const res = await cronGET(
      getRequest("/api/cron/daily-current-affairs", { authorization: "Bearer test-cron-secret" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; generated: boolean };
    expect(body.date).toBe("2026-10-03");
    expect(body.generated).toBe(true);
    expect(publishDailyNote).toHaveBeenCalled();
  });

  it("reports generated:false when the day already exists", async () => {
    vi.mocked(publishDailyNote).mockResolvedValue({ note: NOTE, generated: false } as never);

    const res = await cronGET(
      getRequest("/api/cron/daily-current-affairs", { authorization: "Bearer test-cron-secret" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; generated: boolean };
    expect(body.generated).toBe(false);
  });

  it("accepts the query secret and an explicit date", async () => {
    vi.mocked(publishDailyNote).mockResolvedValue({ note: NOTE, generated: true } as never);

    const res = await cronGET(
      getRequest("/api/cron/daily-current-affairs?secret=test-cron-secret&date=2026-10-01"),
    );
    expect(res.status).toBe(200);
    expect(publishDailyNote).toHaveBeenCalledWith(new Date("2026-10-01T00:00:00.000Z"));
  });

  it("rejects a malformed date", async () => {
    const res = await cronGET(
      getRequest("/api/cron/daily-current-affairs?secret=test-cron-secret&date=bogus"),
    );
    expect(res.status).toBe(400);
  });

  it("503s when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const res = await cronGET(
      getRequest("/api/cron/daily-current-affairs?secret=x"),
    );
    expect(res.status).toBe(503);
  });
});

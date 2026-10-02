// @vitest-environment node
//
// POST /api/learning-events — strict-allowlist funnel endpoint tests.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { POST as learningEventsPOST } from "~app/api/learning-events/route";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function postRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/api/learning-events`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function sessionCookieFor(email: string): Promise<string> {
  const token = await signSession({ email, ver: 0 });
  return `auth_token=${token}`;
}

function mockUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "usr_123",
    name: "Test Aspirant",
    email: "aspirant@example.com",
    handle: "aspirant",
    passwordHash: "hashed",
    tokenVersion: 0,
    role: "STUDENT",
    sessions: [],
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/learning-events", () => {
  it("requires a session", async () => {
    const res = await learningEventsPOST(postRequest({ type: "REC_ACCEPTED" }));
    expect(res.status).toBe(401);
  });

  it("rejects types outside the allowlist", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    const createMany = vi.fn();
    vi.mocked(prisma.learningEvent.createMany).mockImplementation(createMany);
    const res = await learningEventsPOST(
      postRequest({ type: "QUESTION_CORRECT" }, { cookie }),
    );
    expect(res.status).toBe(400);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("rejects non-object metadata", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    const res = await learningEventsPOST(
      postRequest({ type: "REC_ACCEPTED", metadata: "nope" }, { cookie }),
    );
    expect(res.status).toBe(400);
  });

  it("records REC_ACCEPTED with metadata for the caller", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.mocked(prisma.learningEvent.createMany).mockImplementation(createMany);
    const res = await learningEventsPOST(
      postRequest(
        { type: "REC_ACCEPTED", metadata: { recId: "diagnostic", target: "practice" } },
        { cookie },
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(createMany).toHaveBeenCalledOnce();
    const rows = createMany.mock.calls[0][0] as { data: Array<Record<string, unknown>> };
    expect(rows.data[0]).toMatchObject({
      userId: "usr_123",
      type: "REC_ACCEPTED",
      metadata: { recId: "diagnostic", target: "practice" },
    });
  });
});

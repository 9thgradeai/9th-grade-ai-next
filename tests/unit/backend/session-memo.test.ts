// @vitest-environment node
//
// getSessionUser per-request memo: repeated auth checks with the same Request
// share one JWT verify + DB lookup; a new Request always re-resolves (no
// cross-request or cross-test leakage — bans/revocation stay immediate).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSessionUser, signSession } from "~backend/auth";
import { prisma } from "~backend/db";

process.env.AUTH_SECRET ??= "test-secret-key-for-unit-tests-only";

function authedRequest(token: string): Request {
  return new Request("http://localhost/api/test", {
    headers: { cookie: `auth_token=${token}` },
  });
}

const dbUser = {
  id: "u1",
  name: "Test User",
  email: "t@example.com",
  handle: "test",
  tokenVersion: 3,
  role: "STUDENT",
  emailVerified: true,
  onboarded: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  authProvider: "password",
  imageUrl: null,
  examTarget: null,
  examDate: null,
  prepLevel: null,
  studyHoursPerDay: null,
  goal: null,
  sessions: "[]",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser as never);
});

describe("getSessionUser per-request memo", () => {
  it("dedupes repeated checks with the same Request object", async () => {
    const token = await signSession({ email: dbUser.email, ver: 3 });
    const req = authedRequest(token);
    const [a, b] = await Promise.all([getSessionUser(req), getSessionUser(req)]);
    expect(a?.id).toBe("u1");
    expect(b?.id).toBe("u1");
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-resolves for a new Request (no cross-request leakage)", async () => {
    const token = await signSession({ email: dbUser.email, ver: 3 });
    await getSessionUser(authedRequest(token));
    await getSessionUser(authedRequest(token));
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });

  it("returns null without a token and never touches the DB", async () => {
    const req = new Request("http://localhost/api/test");
    await expect(getSessionUser(req)).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

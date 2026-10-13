// @vitest-environment node
//
// P2b — sessions live in the Session table: cap enforcement, logout removal,
// sid verification, and legacy-JSON import-on-hit.

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addUserSession,
  removeUserSession,
  getActiveSessionCount,
  getSessionUser,
  signSession,
} from "~backend/auth";
import { prisma } from "~backend/db";

process.env.AUTH_SECRET ??= "test-secret-key-for-unit-tests-only";

function authedRequest(token: string): Request {
  return new Request("http://localhost/api/test", {
    headers: { cookie: `auth_token=${token}` },
  });
}

const SID = "sid-1111-2222-3333-444444444444";

function dbUserWith(sessions: unknown) {
  return {
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
    sessions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Session table storage", () => {
  it("creates a row with an expiry and skips eviction under the cap", async () => {
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);
    vi.mocked(prisma.session.findMany).mockResolvedValue([
      { id: "a", createdAt: new Date(), userAgent: null, ip: null },
      { id: "b", createdAt: new Date(), userAgent: null, ip: null },
      { id: "c", createdAt: new Date(), userAgent: null, ip: null },
    ] as never);

    const active = await addUserSession("u1", {
      id: SID,
      createdAt: new Date().toISOString(),
      userAgent: "ua",
    });

    expect(prisma.session.create).toHaveBeenCalledTimes(1);
    const data = vi.mocked(prisma.session.create).mock.calls[0][0] as {
      data: { id: string; userId: string; expiresAt: Date };
    };
    expect(data.data.id).toBe(SID);
    expect(data.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    // Only the expiry prune ran — no cap eviction under 5.
    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(active).toHaveLength(3);
  });

  it("evicts oldest rows when at the 5-session cap", async () => {
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.session.create).mockResolvedValue({} as never);
    vi.mocked(prisma.session.findMany).mockResolvedValue([
      { id: SID, createdAt: new Date(), userAgent: null, ip: null },
      { id: "a", createdAt: new Date(), userAgent: null, ip: null },
      { id: "b", createdAt: new Date(), userAgent: null, ip: null },
      { id: "c", createdAt: new Date(), userAgent: null, ip: null },
      { id: "d", createdAt: new Date(), userAgent: null, ip: null },
    ] as never);

    await addUserSession("u1", { id: SID, createdAt: new Date().toISOString() });

    // Prune + cap-eviction deletes.
    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(2);
    const evict = vi.mocked(prisma.session.deleteMany).mock.calls[1][0] as {
      where: { userId: string; id: { notIn: string[] } };
    };
    expect(evict.where.userId).toBe("u1");
    expect(evict.where.id.notIn).toHaveLength(5);
  });

  it("removes a single row on logout", async () => {
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 } as never);
    await removeUserSession("u1", SID);
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", id: SID },
    });
  });

  it("counts only unexpired rows", async () => {
    vi.mocked(prisma.session.count).mockResolvedValue(2 as never);
    await expect(getActiveSessionCount("u1")).resolves.toBe(2);
    expect(prisma.session.count).toHaveBeenCalledWith({
      where: { userId: "u1", expiresAt: { gt: expect.any(Date) } },
    });
  });
});

describe("sid verification against the Session table", () => {
  it("accepts a sid with a live table row", async () => {
    const token = await signSession({ email: "t@example.com", ver: 3, sid: SID });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUserWith("[]") as never);
    vi.mocked(prisma.session.findFirst).mockResolvedValue({
      id: SID,
      expiresAt: new Date(Date.now() + 1000),
    } as never);

    const user = await getSessionUser(authedRequest(token));
    expect(user?.id).toBe("u1");
  });

  it("rejects a sid with no table row", async () => {
    const token = await signSession({ email: "t@example.com", ver: 3, sid: SID });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUserWith("[]") as never);
    vi.mocked(prisma.session.findFirst).mockResolvedValue(null);

    await expect(getSessionUser(authedRequest(token))).resolves.toBeNull();
  });
});

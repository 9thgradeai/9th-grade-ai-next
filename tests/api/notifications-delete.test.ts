// @vitest-environment node
//
// Regression tests for the notifications DELETE ownership fix (P-S1):
// DELETE /api/notifications/[id] must never delete another user's row — it
// deletes the caller's own notification and hides (marks read) shared ones.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User as PrismaUser } from "@prisma/client";

import { DELETE as notificationsDELETE } from "~app/api/notifications/[id]/route";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function deleteRequest(id: number, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}/api/notifications/${id}`, { method: "DELETE", headers });
}

function paramsFor(id: number) {
  return { params: Promise.resolve({ id: String(id) }) };
}

async function sessionCookieFor(email: string): Promise<string> {
  const token = await signSession({ email, ver: 0 });
  return `auth_token=${token}`;
}

function mockUser(overrides: Partial<Record<string, unknown>> = {}): PrismaUser {
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
  } as unknown as PrismaUser;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DELETE /api/notifications/[id]", () => {
  it("requires a session", async () => {
    expect((await notificationsDELETE(deleteRequest(1), paramsFor(1))).status).toBe(401);
  });

  it("rejects non-integer ids", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    const res = await notificationsDELETE(
      deleteRequest(0, { cookie }),
      paramsFor(0),
    );
    expect(res.status).toBe(400);
  });

  it("deletes the caller's own notification", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.appNotification.findUnique).mockResolvedValue({
      id: 7,
      userId: "usr_123",
    } as never);
    const del = vi.fn().mockResolvedValue({ id: 7 });
    vi.mocked(prisma.appNotification.delete).mockImplementation(del);

    const res = await notificationsDELETE(deleteRequest(7, { cookie }), paramsFor(7));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(del).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it("never deletes another user's notification — hides it instead", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.appNotification.findUnique).mockResolvedValue({
      id: 9,
      userId: "usr_other",
    } as never);
    const del = vi.fn();
    vi.mocked(prisma.appNotification.delete).mockImplementation(del);
    const upsert = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.notificationRead.upsert).mockImplementation(upsert);

    const res = await notificationsDELETE(deleteRequest(9, { cookie }), paramsFor(9));
    expect(res.status).toBe(200);
    expect(del).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_notificationId: { userId: "usr_123", notificationId: 9 } },
      update: {},
      create: { userId: "usr_123", notificationId: 9 },
    });
  });

  it("never deletes a global broadcast — marks it read for the caller", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser());
    vi.mocked(prisma.appNotification.findUnique).mockResolvedValue({
      id: 3,
      userId: null,
    } as never);
    const del = vi.fn();
    vi.mocked(prisma.appNotification.delete).mockImplementation(del);
    const upsert = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.notificationRead.upsert).mockImplementation(upsert);

    const res = await notificationsDELETE(deleteRequest(3, { cookie }), paramsFor(3));
    expect(res.status).toBe(200);
    expect(del).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalled();
  });
});

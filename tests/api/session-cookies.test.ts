// @vitest-environment node
//
// Regression tests for getSessionUserFromCookies() — the Server Component
// variant of the session lookup used by app/admin/layout.tsx.
//
// It must apply the SAME chain as the Request-based path:
// JWT verification → user lookup → ban check → tokenVersion check.
// Mocking Prisma is fine here: the thing under test is the auth helper, not
// an ownership query.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User as PrismaUser } from "@prisma/client";
import { cookies } from "next/headers";

import { getSessionUserFromCookies, signSession } from "~backend/auth";
import { prisma } from "~backend/db";

process.env.AUTH_SECRET ??= "test-secret-key-for-unit-tests-only";

function dbUser(overrides: Partial<PrismaUser> = {}): PrismaUser {
  return {
    id: "usr_a",
    name: "User A",
    email: "usera@example.com",
    handle: "usera",
    passwordHash: "",
    tokenVersion: 0,
    role: "STUDENT",
    emailVerified: true,
    onboarded: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    authProvider: "password",
    googleId: null,
    imageUrl: null,
    examTarget: null,
    examDate: null,
    prepLevel: null,
    studyHoursPerDay: null,
    goal: null,
    emailVerifyToken: null,
    emailVerifyExpires: null,
    passwordResetToken: null,
    passwordResetExpires: null,
    ...overrides,
  } as unknown as PrismaUser;
}

function withCookie(token: string | null) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) => (name === "auth_token" && token ? { value: token } : undefined),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getSessionUserFromCookies", () => {
  it("returns null when the session cookie is absent", async () => {
    withCookie(null);
    await expect(getSessionUserFromCookies()).resolves.toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for a garbage token", async () => {
    withCookie("not-a-jwt");
    await expect(getSessionUserFromCookies()).resolves.toBeNull();
  });

  it("resolves the user for a valid session cookie", async () => {
    const token = await signSession({ email: "usera@example.com", ver: 0 });
    withCookie(token);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser() as never);

    const user = await getSessionUserFromCookies();
    expect(user?.id).toBe("usr_a");
    expect(user?.role).toBe("student");
  });

  it("rejects a banned user even with an unexpired token", async () => {
    const token = await signSession({ email: "banned@example.com", ver: 0 });
    withCookie(token);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      dbUser({ email: "banned@example.com", role: "BANNED" }) as never,
    );

    await expect(getSessionUserFromCookies()).resolves.toBeNull();
  });

  it("rejects a token minted before a tokenVersion bump", async () => {
    const token = await signSession({ email: "usera@example.com", ver: 0 });
    withCookie(token);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      dbUser({ tokenVersion: 3 }) as never,
    );

    await expect(getSessionUserFromCookies()).resolves.toBeNull();
  });
});

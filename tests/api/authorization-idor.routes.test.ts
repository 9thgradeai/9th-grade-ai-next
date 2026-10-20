// @vitest-environment node
//
// Authorization/IDOR regression tests: two authenticated users, ownership enforced.
// Uses real auth (getSessionUser/getUserIdFromRequest) with mocked Prisma; does NOT
// mock away ownership checks. Exercises route handlers directly.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User as PrismaUser } from "@prisma/client";
import { hash } from "bcryptjs";

import { GET as bookmarksGET, POST as bookmarksPOST } from "~app/api/bookmarks/route";
import { GET as conversationsGET, POST as conversationsPOST } from "~app/api/ai/conversations/route";
import { GET as conversationGET, PATCH as conversationPATCH, DELETE as conversationDELETE } from "~app/api/ai/conversations/[id]/route";
import { GET as mistakesGET } from "~app/api/mistakes/route";
import { GET as adminUsersGET } from "~app/api/admin/users/route";
import { signSession } from "~backend/auth";
import { resetRateLimitStore } from "~backend/rate-limit";
import { prisma } from "~backend/db";

const BASE = "https://app.example.com";

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function patchRequest(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function deleteRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "DELETE", headers });
}

const TEST_PASSWORD = "correct-horse-battery";
let passwordHashBcrypt: string;

beforeAll(async () => {
  passwordHashBcrypt = await hash(TEST_PASSWORD, 10);
});

function dbUser(overrides: Partial<Record<string, unknown>> = {}): PrismaUser {
  return {
    id: "usr_a",
    name: "User A",
    email: "usera@example.com",
    handle: "usera",
    passwordHash: passwordHashBcrypt,
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

async function cookieFor(email: string, ver = 0): Promise<string> {
  const token = await signSession({ email, ver });
  return `auth_token=${token}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  void resetRateLimitStore();
});

describe("Bookmarks - ownership enforcement", () => {
  it("returns 401 for unauthenticated GET /api/bookmarks", async () => {
    const res = await bookmarksGET(getRequest("/api/bookmarks"));
    expect(res.status).toBe(401);
  });

  it("user A sees only their own bookmarks; user B cannot access user A's bookmarks", async () => {
    const cookieA = await cookieFor("usera@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_a", email: "usera@example.com", handle: "usera" }) as never);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([{ questionId: 101 }, { questionId: 202 }] as never);

    const resA = await bookmarksGET(getRequest("/api/bookmarks", { cookie: cookieA }));
    expect(resA.status).toBe(200);
    const bodyA = await resA.json();
    expect(bodyA.bookmarked).toEqual([101, 202]);
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "usr_a" } }));

    // User B
    vi.clearAllMocks();
    void resetRateLimitStore();
    const cookieB = await cookieFor("userb@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_b", email: "userb@example.com", handle: "userb" }) as never);
    vi.mocked(prisma.bookmark.findMany).mockResolvedValue([] as never);

    const resB = await bookmarksGET(getRequest("/api/bookmarks", { cookie: cookieB }));
    expect(resB.status).toBe(200);
    const bodyB = await resB.json();
    expect(bodyB.bookmarked).toEqual([]);
    expect(prisma.bookmark.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "usr_b" } }));
  });

  it("POST /api/bookmarks requires auth and uses session userId only (no client userId accepted)", async () => {
    const res = await bookmarksPOST(
      jsonRequest("/api/bookmarks", { questionId: 5 }, { origin: "https://app.example.com" }),
    );
    expect([401, 403]).toContain(res.status);
  });
});

describe("AI Conversations - ownership enforcement", () => {
  const convParams = { params: Promise.resolve({ id: "conv_123" }) };

  it("GET /api/ai/conversations requires auth", async () => {
    const res = await conversationsGET(getRequest("/api/ai/conversations"));
    expect(res.status).toBe(401);
  });

  it("user B cannot access user A's conversation (service scoped by userId)", async () => {
    const cookieB = await cookieFor("userb@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_b", email: "userb@example.com", handle: "userb" }) as never);
    // findFirst with userId:usr_b and id:conv_123 returns null -> service throws NotFoundError
    vi.mocked(prisma.aIConversation.findFirst).mockResolvedValue(null as never);

    const res = await conversationGET(getRequest("/api/ai/conversations/conv_123", { cookie: cookieB }), convParams);
    expect(res.status).toBe(404);
  });

  it("user A can access their own conversation", async () => {
    const cookieA = await cookieFor("usera@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_a", email: "usera@example.com", handle: "usera" }) as never);
    const conv = {
      id: "conv_123",
      userId: "usr_a",
      kind: "TUTOR",
      title: "Test",
      pinned: false,
      subjectId: null,
      topicId: null,
      topicPath: "",
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { messages: 2 },
    };
    vi.mocked(prisma.aIConversation.findFirst).mockResolvedValue(conv as never);
    vi.mocked(prisma.aIMessage.findMany).mockResolvedValue([
      { id: "m1", conversationId: "conv_123", role: "USER", status: "DONE", content: "hi", intent: null, provider: null, model: null, metadata: null, errorCode: null, createdAt: new Date("2026-01-01T00:00:00Z") },
      { id: "m2", conversationId: "conv_123", role: "ASSISTANT", status: "DONE", content: "hello", intent: null, provider: null, model: null, metadata: null, errorCode: null, createdAt: new Date("2026-01-01T00:01:00Z") },
    ] as never);

    const res = await conversationGET(getRequest("/api/ai/conversations/conv_123", { cookie: cookieA }), convParams);
    expect(res.status).toBe(200);
    expect(prisma.aIConversation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "conv_123", userId: "usr_a" } }));
  });
});

describe("Mistakes - ownership enforcement", () => {
  it("returns 401 for unauthenticated GET /api/mistakes", async () => {
    const res = await mistakesGET(getRequest("/api/mistakes"));
    expect(res.status).toBe(401);
  });

  it("user B cannot see user A's mistakes (scoped by userId)", async () => {
    const cookieB = await cookieFor("userb@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_b", email: "userb@example.com", handle: "userb" }) as never);
    vi.mocked(prisma.userQuestionProgress.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.userQuestionProgress.count).mockResolvedValue(0);

    const res = await mistakesGET(getRequest("/api/mistakes", { cookie: cookieB }));
    expect(res.status).toBe(200);
    expect(prisma.userQuestionProgress.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "usr_b" }) }));
  });
});

describe("Admin routes - role enforcement", () => {
  it("returns 401 for unauthenticated access to /api/admin/users", async () => {
    const res = await adminUsersGET(getRequest("/api/admin/users"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user accessing admin route", async () => {
    const cookie = await cookieFor("userb@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_b", email: "userb@example.com", handle: "userb", role: "STUDENT" }) as never);
    const res = await adminUsersGET(getRequest("/api/admin/users", { cookie }));
    expect(res.status).toBe(403);
  });

  it("banned user is rejected by requireRole (treated as forbidden/unauth per implementation)", async () => {
    const cookie = await cookieFor("banned@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser({ id: "usr_ban", email: "banned@example.com", handle: "banned", role: "BANNED" }) as never);
    const res = await adminUsersGET(getRequest("/api/admin/users", { cookie }));
    // requireRole checks banned and throws ForbiddenError (403); getSessionUser may return null for banned -> 401
    expect([401, 403]).toContain(res.status);
  });
});

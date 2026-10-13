// @vitest-environment node
//
// Route-level RBAC tests for GET/PATCH /api/admin/users/[id].
// Covers the negative matrix the helper-level role-guard test cannot:
// unauthenticated (401), student (403), banned (403), bad id (400),
// and the admin happy path (200). Service layer is mocked.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { GET, PATCH } from "~app/api/admin/users/[id]/route";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";
import { getUserDetail, adminAction } from "~backend/services/admin";

vi.mock("~backend/services/admin", () => ({
  getUserDetail: vi.fn(),
  adminAction: vi.fn(),
}));

process.env.AUTH_SECRET ??= "test-secret-key-for-unit-tests-only";

const BASE = "https://app.example.com";
const USER_ID = `c${"a".repeat(24)}`;

function dbUser(role: string) {
  return {
    id: "u1",
    name: "Test User",
    email: "t@example.com",
    handle: "test",
    tokenVersion: 0,
    role,
    emailVerified: true,
    onboarded: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

async function authedCookie(role: string): Promise<string> {
  const token = await signSession({ email: "t@example.com", ver: 0 });
  vi.mocked(prisma.user.findUnique).mockResolvedValue(dbUser(role) as never);
  return `auth_token=${token}`;
}

function getReq(cookie?: string): Request {
  return new Request(`${BASE}/api/admin/users/${USER_ID}`, {
    headers: cookie ? { cookie } : {},
  });
}

function patchReq(body: unknown, cookie?: string): Request {
  return new Request(`${BASE}/api/admin/users/${USER_ID}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: USER_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/users/[id] — role gate", () => {
  it("returns 401 without a session", async () => {
    const res = await GET(getReq(), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student session", async () => {
    const res = await GET(getReq(await authedCookie("STUDENT")), params);
    expect(res.status).toBe(403);
  });

  it("rejects a banned session before the role check (401 — ban kills the session)", async () => {
    const res = await GET(getReq(await authedCookie("BANNED")), params);
    expect(res.status).toBe(401);
    expect(vi.mocked(getUserDetail)).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed id even as admin", async () => {
    const res = await GET(
      getReq(await authedCookie("ADMIN")),
      { params: Promise.resolve({ id: "not-a-cuid" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns the safe user detail as admin", async () => {
    vi.mocked(getUserDetail).mockResolvedValue({
      id: USER_ID,
      email: "target@example.com",
      passwordHash: "secret",
      emailVerifyToken: "secret",
      passwordResetToken: "secret",
    } as never);
    const res = await GET(getReq(await authedCookie("ADMIN")), params);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: Record<string, unknown> };
    expect(body.user.email).toBe("target@example.com");
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body.user).not.toHaveProperty("emailVerifyToken");
    expect(body.user).not.toHaveProperty("passwordResetToken");
  });
});

describe("PATCH /api/admin/users/[id] — role gate", () => {
  it("returns 401 without a session", async () => {
    const res = await PATCH(patchReq({ action: "ban" }), params);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a student session", async () => {
    const res = await PATCH(
      patchReq({ action: "ban" }, await authedCookie("STUDENT")),
      params,
    );
    expect(res.status).toBe(403);
    expect(vi.mocked(adminAction)).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown action as admin", async () => {
    const res = await PATCH(
      patchReq({ action: "promote" }, await authedCookie("ADMIN")),
      params,
    );
    expect(res.status).toBe(400);
  });

  it("applies a ban as admin", async () => {
    vi.mocked(adminAction).mockResolvedValue({ success: true } as never);
    const res = await PATCH(
      patchReq({ action: "ban" }, await authedCookie("ADMIN")),
      params,
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(adminAction)).toHaveBeenCalledWith(USER_ID, "ban");
  });
});

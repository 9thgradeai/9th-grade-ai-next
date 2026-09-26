// @vitest-environment node
//
// Route-handler integration tests for the staged preparation-intelligence
// endpoint (Phase 1). Verifies auth gating, scope/window validation, and that
// each scope dispatches to its own builder (payload isolation).

import { describe, it, expect, beforeEach, vi } from "vitest";

import { GET as intelligenceGET } from "~app/api/preparation-intelligence/route";
import {
  getPreparationIntelligence,
  getIntelligencePulse,
  getIntelligenceTasks,
  getIntelligenceAnalytics,
} from "~backend/services/preparation-intelligence";
import { signSession } from "~backend/auth";
import { prisma } from "~backend/db";

vi.mock("~backend/services/preparation-intelligence", () => ({
  getPreparationIntelligence: vi.fn(),
  getIntelligencePulse: vi.fn(),
  getIntelligenceTasks: vi.fn(),
  getIntelligenceAnalytics: vi.fn(),
}));

const BASE = "https://app.example.com";

function getRequest(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

async function sessionCookieFor(email: string): Promise<string> {
  const token = await signSession({ email, ver: 0 });
  return `auth_token=${token}`;
}

function mockUser() {
  return {
    id: "usr_123",
    name: "Test Aspirant",
    email: "aspirant@example.com",
    handle: "aspirant",
    passwordHash: "x",
    tokenVersion: 0,
    role: "STUDENT",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/preparation-intelligence", () => {
  it("requires a session", async () => {
    expect((await intelligenceGET(getRequest("/api/preparation-intelligence"))).status).toBe(401);
  });

  it("rejects an unknown scope", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    const res = await intelligenceGET(
      getRequest("/api/preparation-intelligence?scope=bogus", { cookie }),
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(getPreparationIntelligence).mock.calls).toHaveLength(0);
  });

  it("rejects out-of-range and non-numeric windows", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    for (const w of ["0", "366", "abc"]) {
      const res = await intelligenceGET(
        getRequest(`/api/preparation-intelligence?window=${w}`, { cookie }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("dispatches scope=pulse to the pulse builder only", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(getIntelligencePulse).mockResolvedValue({ streak: 7 } as never);

    const res = await intelligenceGET(
      getRequest("/api/preparation-intelligence?scope=pulse", { cookie }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope).toBe("pulse");
    expect(body.intelligence).toEqual({ streak: 7 });
    expect(res.headers.get("X-Intelligence-Scope")).toBe("pulse");
    expect(vi.mocked(getIntelligencePulse).mock.calls).toHaveLength(1);
    expect(vi.mocked(getIntelligenceTasks).mock.calls).toHaveLength(0);
    expect(vi.mocked(getIntelligenceAnalytics).mock.calls).toHaveLength(0);
    expect(vi.mocked(getPreparationIntelligence).mock.calls).toHaveLength(0);
  });

  it("dispatches scope=tasks and scope=analytics to their builders", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(getIntelligenceTasks).mockResolvedValue({ studyTasks: [] } as never);
    vi.mocked(getIntelligenceAnalytics).mockResolvedValue({ recommendations: [] } as never);

    const tasksRes = await intelligenceGET(
      getRequest("/api/preparation-intelligence?scope=tasks", { cookie }),
    );
    expect(tasksRes.status).toBe(200);
    expect((await tasksRes.json()).scope).toBe("tasks");

    const analyticsRes = await intelligenceGET(
      getRequest("/api/preparation-intelligence?scope=analytics", { cookie }),
    );
    expect(analyticsRes.status).toBe(200);
    expect((await analyticsRes.json()).scope).toBe("analytics");
  });

  it("passes an explicit window through to the full builder", async () => {
    const cookie = await sessionCookieFor("aspirant@example.com");
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser() as never);
    vi.mocked(getPreparationIntelligence).mockResolvedValue({ streak: 1 } as never);

    const res = await intelligenceGET(
      getRequest("/api/preparation-intelligence?window=365", { cookie }),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(getPreparationIntelligence).mock.calls[0]).toEqual([
      "usr_123",
      { activityDays: 365 },
    ]);
  });
});

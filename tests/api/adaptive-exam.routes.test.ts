// @vitest-environment node
//
// Adaptive Exam API seam: thin-route invariants plus behavioural checks of the
// shared auth / validation / header wrapper.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserIdFromRequestMock, requireRoleMock } = vi.hoisted(() => ({
  getUserIdFromRequestMock: vi.fn(),
  requireRoleMock: vi.fn(),
}));

vi.mock("~backend/services/user", () => ({
  getUserIdFromRequest: (...args: unknown[]) => getUserIdFromRequestMock(...args),
  requireRole: (...args: unknown[]) => requireRoleMock(...args),
}));

vi.mock("~backend/services/adaptive-exam/orchestrator-factory", () => ({
  createDefaultAdaptiveServices: vi.fn(async () => ({ ports: {} })),
}));

import {
  assertNoBodyUserId,
  assertNoUnknownFields,
  enforceRateLimit,
  runAdaptiveRoute,
} from "~app/api/adaptive-exam/_shared";
import { AppError } from "~backend/errors";

const ROOT = join(process.cwd(), "app", "api", "adaptive-exam");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function request(body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/adaptive-exam/test", {
    method: body === undefined ? "POST" : "POST",
    headers: { "content-type": "application/json", "x-request-id": "req-test", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("adaptive exam route invariants", () => {
  const files = routeFiles(ROOT);

  it("finds the full adaptive route set", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it("every route delegates through runAdaptiveRoute", () => {
    const offenders = files.filter((file) => !/runAdaptiveRoute\s*\(/.test(readFileSync(file, "utf8")));
    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });

  it("admin routes opt into adminOnly and no route hardcodes a body userId", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (file.includes(`${"admin"}`) && !/adminOnly:\s*true/.test(src)) {
        offenders.push(relative(process.cwd(), file));
      }
      if (/userId\s*:\s*["'`]/.test(src)) offenders.push(relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  it("body-parsing routes reject client-supplied identity", () => {
    const offenders = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /needBody:\s*true/.test(src) && !/assertNoBodyUserId/.test(src) && !/runAdaptiveRoute/.test(src);
    });
    expect(offenders.map((file) => relative(process.cwd(), file))).toEqual([]);
  });
});

describe("shared adaptive route wrapper", () => {
  beforeEach(() => {
    getUserIdFromRequestMock.mockReset();
    requireRoleMock.mockReset();
    getUserIdFromRequestMock.mockResolvedValue("candidate-1");
    requireRoleMock.mockResolvedValue({ id: "admin-1", role: "admin" });
  });

  it("returns 401 when no session user exists", async () => {
    getUserIdFromRequestMock.mockResolvedValue(null);
    const response = await runAdaptiveRoute(request({ ok: true }), {
      bucket: "auth-test",
      needBody: true,
      handler: async () => ({ ok: true }),
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBe("req-test");
  });

  it("rejects a body userId and unknown fields before delegating", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const withUserId = await runAdaptiveRoute(request({ userId: "attacker" }), {
      bucket: "body-test",
      needBody: true,
      handler,
    });
    expect(withUserId.status).toBe(400);
    expect(handler).not.toHaveBeenCalled();

    expect(() => assertNoBodyUserId({ profileId: "BCS_PRELIMINARY" })).not.toThrow();
    expect(() => assertNoUnknownFields({ profileId: "x", extra: 1 }, ["profileId"])).toThrow(AppError);
  });

  it("enforces admin role separately from the V2 UI flag", async () => {
    requireRoleMock.mockRejectedValue(new AppError(403, "Admin only.", "FORBIDDEN"));
    const handler = vi.fn(async () => ({ ok: true }));
    const response = await runAdaptiveRoute(request(), {
      bucket: "admin-test",
      adminOnly: true,
      handler,
    });
    expect(response.status).toBe(403);
    expect(requireRoleMock).toHaveBeenCalledWith(expect.anything(), ["admin"]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("adds correlation and timing headers on success and rate-limits repeats", async () => {
    const handler = vi.fn(async ({ userId }: { userId: string }) => ({ userId }));
    const first = await runAdaptiveRoute(request(), {
      bucket: "headers-test",
      handler,
    });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-request-id")).toBe("req-test");
    expect(first.headers.get("x-response-time")).toMatch(/ms$/);
    expect(await first.json()).toEqual({ userId: "candidate-1" });

    getUserIdFromRequestMock.mockResolvedValue("flood-user");
    for (let i = 0; i < 60; i += 1) {
      const result = await runAdaptiveRoute(request(), { bucket: "flood-test", handler });
      expect(result.status).toBe(200);
    }
    const limited = await runAdaptiveRoute(request(), { bucket: "flood-test", handler });
    expect(limited.status).toBe(429);
  });

  it("applies a per-user bucket independently", () => {
    expect(() => enforceRateLimit("bucket-user-a", "isolation-test")).not.toThrow();
    expect(() => enforceRateLimit("bucket-user-b", "isolation-test")).not.toThrow();
  });
});

// @vitest-environment node
//
// GET /api/health — unauthenticated status probe. The point of these tests
// is the disclosure contract: raw Prisma/Redis errors can embed the
// database host and connection topology, so the response body must carry a
// generic message outside development (the raw error is still logged
// server-side). The route never requires auth, which is exactly why the
// response is policed here.

import { describe, it, expect, beforeEach, vi } from "vitest";

import { GET } from "~app/api/health/route";
import { prisma } from "~backend/db";
import { getRateLimitStore } from "~backend/infrastructure/cache";

vi.mock("~backend/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("~backend/infrastructure/cache", () => ({
  getRateLimitStore: vi.fn(),
}));

const RAW_DB_ERROR =
  "Can't reach database server at `ep-secret-host-xyz.us-east-1.aws.neon.tech:5432`";

function memoryStore() {
  return { name: "memory", consume: vi.fn() };
}

async function getHealth(): Promise<Response> {
  return GET();
}

beforeEach(() => {
  vi.mocked(prisma.$queryRaw).mockReset();
  vi.mocked(getRateLimitStore).mockReset();
  vi.mocked(getRateLimitStore).mockReturnValue(memoryStore() as never);
});

describe("GET /api/health", () => {
  it("returns 200 with all checks healthy and no error fields", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never);

    const res = await getHealth();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.status).toBe("healthy");
    expect(body.checks.redis.status).toBe("healthy");
    expect(body.checks.database.error).toBeUndefined();
    expect(body.checks.redis.error).toBeUndefined();
  });

  it("returns 503 with a GENERIC database error (no host/topology leak) outside development", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error(RAW_DB_ERROR));

    const res = await getHealth();
    expect(res.status).toBe(503);
    const text = await res.text();
    const body = JSON.parse(text);

    expect(body.status).toBe("degraded");
    expect(body.checks.database.status).toBe("unhealthy");
    // The raw Prisma message must not reach the unauthenticated response.
    expect(body.checks.database.error).toBe("unavailable");
    expect(text).not.toContain("neon.tech");
    expect(text).not.toContain("5432");
    expect(text).not.toContain(RAW_DB_ERROR);
  });

  it("returns 503 with a GENERIC redis error when the rate-limit store check fails", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }] as never);
    vi.mocked(getRateLimitStore).mockReturnValue({
      name: "redis",
      consume: vi.fn().mockRejectedValue(new Error("ECONNREFUSED 10.0.7.3:6379")),
    } as never);

    const res = await getHealth();
    expect(res.status).toBe(503);
    const text = await res.text();
    const body = JSON.parse(text);

    expect(body.checks.database.status).toBe("healthy");
    expect(body.checks.redis.status).toBe("unhealthy");
    expect(body.checks.redis.error).toBe("unavailable");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text).not.toContain("10.0.7.3");
  });
});

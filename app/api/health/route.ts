import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { getRateLimitStore } from "~backend/infrastructure/cache";
import { log } from "~backend/infrastructure/observability/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Raw checker errors are kept for logging, but ONLY development exposes them
// in the response body: Prisma/Redis connection failures embed the database
// host and connection topology, and /api/health is unauthenticated. Matches
// the toHttpResponse() policy — internals for local dev, generic elsewhere.
const exposeDetails = process.env.NODE_ENV === "development";

function safeErrorMessage(raw: string): string {
  return exposeDetails ? raw : "unavailable";
}

async function checkDatabase(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRedis(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const store = getRateLimitStore();
    if (store.name === "memory") {
      return { healthy: true, latencyMs: Date.now() - start };
    }
    await store.consume("health-check", 1, 1000);
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const start = Date.now();

  const [db, redis] = await Promise.all([checkDatabase(), checkRedis()]);

  const allHealthy = db.healthy && redis.healthy;
  const status = allHealthy ? 200 : 503;

  if (!allHealthy) {
    log.error("health.degraded", {
      database: db.error ?? "healthy",
      redis: redis.error ?? "healthy",
    });
  }

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - ((globalThis as { __startTime?: number }).__startTime ?? Date.now()),
      checks: {
        database: { status: db.healthy ? "healthy" : "unhealthy", latencyMs: db.latencyMs, ...(db.error ? { error: safeErrorMessage(db.error) } : {}) },
        redis: { status: redis.healthy ? "healthy" : "unhealthy", latencyMs: redis.latencyMs, ...(redis.error ? { error: safeErrorMessage(redis.error) } : {}) },
      },
    },
    { status },
  );
}

(globalThis as { __startTime?: number }).__startTime ??= Date.now();
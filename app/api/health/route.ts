import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { getRateLimitStore } from "~backend/infrastructure/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeMs: Date.now() - ((globalThis as { __startTime?: number }).__startTime ?? Date.now()),
      checks: {
        database: { status: db.healthy ? "healthy" : "unhealthy", latencyMs: db.latencyMs, ...(db.error ? { error: db.error } : {}) },
        redis: { status: redis.healthy ? "healthy" : "unhealthy", latencyMs: redis.latencyMs, ...(redis.error ? { error: redis.error } : {}) },
      },
    },
    { status },
  );
}

(globalThis as { __startTime?: number }).__startTime ??= Date.now();
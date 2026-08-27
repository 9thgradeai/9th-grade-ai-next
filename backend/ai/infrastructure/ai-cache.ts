import "server-only";

// Best-effort AI response cache. Cuts cost + latency on repeated questions
// (the same BCS/ব্যাংক question is asked by many aspirants). In-memory by
// default; uses Redis when REDIS_URL is configured. All failures are
// fail-open: a cache miss or error simply falls through to the LLM.

import Redis from "ioredis";

const TTL_MS = 1000 * 60 * 60 * 24; // 24h

const mem = new Map<string, { value: string; exp: number }>();

let redis: Redis | null = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
  });
  redis.on("error", () => {
    // swallow; caller treats cache as best-effort
  });
}

export async function aiCacheGet(key: string): Promise<string | null> {
  try {
    if (redis) {
      const v = await redis.get(`ai:${key}`);
      return v ?? null;
    }
    const hit = mem.get(key);
    if (hit && hit.exp > Date.now()) return hit.value;
    if (hit) mem.delete(key);
  } catch {
    // fail open
  }
  return null;
}

export async function aiCacheSet(key: string, value: string): Promise<void> {
  try {
    if (redis) {
      await redis.set(`ai:${key}`, value, "PX", TTL_MS);
      return;
    }
    mem.set(key, { value, exp: Date.now() + TTL_MS });
  } catch {
    // fail open
  }
}

/** Stable, collision-resistant key from heterogeneous parts. */
export function aiCacheKey(parts: (string | number | undefined)[]): string {
  const raw = parts.join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(h, 31) + raw.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

import "server-only";

import Redis from "ioredis";
import { log } from "~backend/infrastructure/observability/logger";

// Single shared Redis client for the whole backend (rate-limit store,
// AI response cache, query cache). Three separate clients meant three
// connection pools, three error handlers and tripled reconnect storms —
// everything now funnels through here. Null when REDIS_URL is unset, in
// which case every consumer falls back to its in-memory path.

let shared: Redis | null | undefined;

export function getSharedRedisClient(): Redis | null {
  if (shared !== undefined) return shared;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    shared = null;
    return shared;
  }
  const client = new Redis(redisUrl, {
    // Fail fast instead of queueing commands while disconnected.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  // Without an 'error' listener Node treats connection issues as
  // unhandled events and crashes the process.
  client.on("error", (error: Error) => {
    log.error("redis.shared-client-error", { error: error.message });
  });
  shared = client;
  return shared;
}

/** Test hook — drop the cached client so env changes take effect. */
export function resetSharedRedisClient(): void {
  const client = shared;
  shared = undefined;
  if (client) {
    try {
      client.disconnect();
    } catch {
      // Best-effort teardown only.
    }
  }
}

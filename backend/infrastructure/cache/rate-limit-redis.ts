// backend/infrastructure/cache/rate-limit-redis.ts
// Redis-backed store for distributed deployments. Active when REDIS_URL is
// set — infrastructure/cache/index.ts constructs this store with an ioredis
// client and wraps it in fail-open error handling.
// Counters live under a dedicated prefix; application code never flushes them.

import "server-only";

import type { RateLimitResult, RateLimitStore } from "./rate-limit-store";

const KEY_PREFIX = "rl:v1:";

/** Smallest surface we need — any Redis client (ioredis, node-redis…) adapts. */
export interface MinimalRedisClient {
  incr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number | void>;
}

export class RedisRateLimitStore implements RateLimitStore {
  readonly name = "redis" as const;

  constructor(private readonly client: MinimalRedisClient) {}

  async consume(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    const rkey = `${KEY_PREFIX}${key}`;
    const count = await this.client.incr(rkey);
    if (count === 1) {
      // First increment in the window owns the TTL. If a previous owner set
      // one, PEXPIRE simply refreshes it to the current window length.
      await this.client.pexpire(rkey, windowMs);
    }
    return { allowed: count <= max, count, max, resetAt: Date.now() + windowMs };
  }

  /** Intentionally no-op: shared store state must never be wiped by app code. */
  async resetAll(): Promise<void> {}
}

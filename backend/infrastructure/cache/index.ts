// backend/infrastructure/cache/index.ts
// Store selection: in-memory by default; Redis when REDIS_URL is set (client
// constructed here — see rate-limit-redis.ts). The rest of the application
// only ever sees the RateLimitStore interface.
//
// Fail-safe rules:
//   • REDIS_URL set  → distributed store. Instances must never silently
//     enforce different limits, so memory is never used as a silent fallback.
//   • Redis outage   → FAIL OPEN: the wrapper logs loudly and allows the
//     request. Rate limiting is defense-in-depth (bcrypt latency, token
//     revocation and the AI usage ledger remain); a cache blip must not take
//     login/AI endpoints down with it.

import "server-only";

import Redis from "ioredis";
import { InMemoryRateLimitStore } from "./rate-limit-memory";
import { RedisRateLimitStore } from "./rate-limit-redis";
import type {
  RateLimitResult,
  RateLimitStore,
  RateLimitStoreName,
} from "./rate-limit-store";
import { log } from "~backend/infrastructure/observability/logger";

let store: RateLimitStore | null = null;

/** Degrades to "allow" when the backing store is unreachable; logs per failure. */
class FailOpenRateLimitStore implements RateLimitStore {
  readonly name: RateLimitStoreName;

  constructor(private readonly inner: RateLimitStore) {
    this.name = inner.name;
  }

  async consume(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    try {
      return await this.inner.consume(key, max, windowMs);
    } catch (error) {
      log.error("rate_limit_store_unavailable", {
        store: this.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: true, count: 0, max, resetAt: Date.now() + windowMs };
    }
  }

  async resetAll(): Promise<void> {
    await this.inner.resetAll();
  }
}

export function getRateLimitStore(): RateLimitStore {
  if (store) return store;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const client = new Redis(redisUrl, {
      // Fail fast instead of queueing commands while disconnected.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => Math.min(times * 500, 5_000),
    });
    // Without an 'error' listener Node treats connection issues as
    // unhandled events and crashes the process.
    client.on("error", (error: Error) => {
      log.error("rate_limit_redis_error", { error: error.message });
    });
    store = new FailOpenRateLimitStore(new RedisRateLimitStore(client));
  } else {
    store = new InMemoryRateLimitStore();
  }
  return store;
}

/** Test hook — force re-selection after env changes. */
export function resetRateLimitStoreSelection(): void {
  store = null;
}

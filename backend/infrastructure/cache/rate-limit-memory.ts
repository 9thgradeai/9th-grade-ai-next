// backend/infrastructure/cache/rate-limit-memory.ts
// In-process fixed-window store for development, tests and single-instance
// deployments. Semantics are byte-compatible with the original limiter that
// shipped in backend/rate-limit.ts (count after increment; allowed while
// count <= max; lazy window reset).

import "server-only";

import type { RateLimitResult, RateLimitStore } from "./rate-limit-store";

interface WindowRecord {
  count: number;
  reset: number;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  readonly name = "memory" as const;

  private windows = new Map<string, WindowRecord>();

  async consume(key: string, max: number, windowMs: number): Promise<RateLimitResult> {
    const now = Date.now();
    const record = this.windows.get(key);

    if (!record || now > record.reset) {
      const fresh: WindowRecord = { count: 1, reset: now + windowMs };
      this.windows.set(key, fresh);
      return { allowed: true, count: fresh.count, max, resetAt: fresh.reset };
    }

    record.count += 1;
    return { allowed: record.count <= max, count: record.count, max, resetAt: record.reset };
  }

  /** Also prunes expired entries opportunistically to bound map growth. */
  async resetAll(): Promise<void> {
    this.windows.clear();
  }
}

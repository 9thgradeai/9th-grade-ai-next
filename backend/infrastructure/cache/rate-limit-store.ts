// backend/infrastructure/cache/rate-limit-store.ts
// The RateLimitStore abstraction (Phase 8): rate limiting depends on THIS
// interface, never on process memory or a specific vendor. The database stays
// authoritative for business data — a rate-limit store only holds short-lived
// counters and may lose them without corrupting anything.

import "server-only";

export type RateLimitStoreName = "memory" | "redis";

export interface RateLimitResult {
  allowed: boolean;
  /** Consumed count including this request. */
  count: number;
  max: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimitStore {
  readonly name: RateLimitStoreName;
  /**
   * Fixed-window consume. Identical semantics across implementations so
   * swapping stores cannot change product behavior — only durability.
   */
  consume(key: string, max: number, windowMs: number): Promise<RateLimitResult>;
  /** Drop every counter (dev/test convenience; safe no-op on shared stores). */
  resetAll(): Promise<void>;
}

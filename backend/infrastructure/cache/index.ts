// backend/infrastructure/cache/index.ts
// Store selection: in-memory by default; Redis once adopted (injected client —
// see rate-limit-redis.ts header). The rest of the application only ever sees
// the RateLimitStore interface.
//
// Fail-safe rule: if REDIS_URL is set, we REFUSE to fall back to memory —
// instances would silently enforce different limits. Misconfiguration must be
// loud.

import "server-only";

import { ConfigurationError } from "~backend/errors";
import { InMemoryRateLimitStore } from "./rate-limit-memory";
import type { RateLimitStore } from "./rate-limit-store";

let store: RateLimitStore | null = null;

export function getRateLimitStore(): RateLimitStore {
  if (!store) {
    if (process.env.REDIS_URL) {
      throw new ConfigurationError(
        "REDIS_URL is set but distributed rate limiting is not active yet. " +
          "Install ioredis and construct RedisRateLimitStore (docs/DECISIONS.md), " +
          "or unset REDIS_URL.",
      );
    }
    store = new InMemoryRateLimitStore();
  }
  return store;
}

/** Test hook — force re-selection after env changes. */
export function resetRateLimitStoreSelection(): void {
  store = null;
}

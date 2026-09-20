// backend/infrastructure/cache/query-cache.ts
// Server-side query caching with Redis (falls back to in-memory)
// TTL-based invalidation for expensive read queries

import "server-only";

import Redis from "ioredis";

const DEFAULT_TTL_MS = 60_000; // 1 minute default
const MAX_MEM_ENTRIES = 500;

const mem = new Map<string, { value: unknown; evictOrder: number }>();
let evictCounter = 0;

let redis: Redis | null = null;
if (process.env.REDIS_URL) {
  redis = new Redis(process.env.REDIS_URL, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 2,
    retryStrategy: (times) => Math.min(times * 500, 5_000),
  });
  redis.on("error", (err) => {
    console.warn('[query-cache] Redis error, falling back to memory:', err.message);
  });
}

function getKey(prefix: string, key: string): string {
  return `qcache:${prefix}:${key}`;
}

export async function queryCacheGet<T>(prefix: string, key: string): Promise<T | null> {
  try {
    const fullKey = getKey(prefix, key);
    if (redis) {
      const v = await redis.get(fullKey);
      return v ? JSON.parse(v) : null;
    }
    const hit = mem.get(fullKey);
    if (hit) {
      // Touch to update eviction order
      hit.evictOrder = ++evictCounter;
      return hit.value as T;
    }
  } catch {
    // fail open
  }
  return null;
}

export async function queryCacheSet<T>(prefix: string, key: string, value: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  try {
    const fullKey = getKey(prefix, key);
    const serialized = JSON.stringify(value);
    if (redis) {
      await redis.set(fullKey, serialized, "PX", ttlMs);
      return;
    }
    // Evict oldest entry if at capacity
    if (mem.size >= MAX_MEM_ENTRIES) {
      let oldestKey = "";
      let oldestOrder = Infinity;
      for (const [k, v] of mem) {
        if (v.evictOrder < oldestOrder) {
          oldestOrder = v.evictOrder;
          oldestKey = k;
        }
      }
      if (oldestKey) mem.delete(oldestKey);
    }
    mem.set(fullKey, { value, evictOrder: ++evictCounter });
  } catch {
    // fail open
  }
}

export async function queryCacheInvalidate(prefix: string, pattern: string): Promise<void> {
  try {
    const fullPattern = getKey(prefix, pattern);
    if (redis) {
      // Use SCAN to find matching keys
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
      return;
    }
    // Memory fallback: delete matching keys
    for (const key of mem.keys()) {
      if (key.startsWith(`qcache:${prefix}:`) && key.includes(pattern)) {
        mem.delete(key);
      }
    }
  } catch {
    // fail open
  }
}

// Test helper - clear all in-memory cache
export function clearQueryCache(): void {
  mem.clear();
}

// Higher-level helpers for specific query types
export const QueryCache = {
  // Exam selection tree - changes only when questions are added/removed
  async getExamTree(ecosystemId?: number): Promise<unknown | null> {
    const key = ecosystemId ? `selection-tree-${ecosystemId}` : 'selection-tree';
    return queryCacheGet('exam', key);
  },
  async setExamTree(data: unknown, ecosystemId?: number): Promise<void> {
    const key = ecosystemId ? `selection-tree-${ecosystemId}` : 'selection-tree';
    return queryCacheSet('exam', key, data, 5 * 60_000);
  },
  async invalidateExamTree(): Promise<void> {
    return queryCacheInvalidate('exam', 'selection-tree');
  },

  // Question lists - per subject/filter combo
  async getQuestions(key: string): Promise<unknown | null> {
    return queryCacheGet('questions', key);
  },
  async setQuestions(key: string, data: unknown): Promise<void> {
    return queryCacheSet('questions', key, data, 2 * 60_000); // 2 min TTL
  },

  // Leaderboard - changes frequently but can cache briefly
  async getLeaderboard(limit: number): Promise<unknown | null> {
    return queryCacheGet('leaderboard', `limit-${limit}`);
  },
  async setLeaderboard(limit: number, data: unknown): Promise<void> {
    return queryCacheSet('leaderboard', `limit-${limit}`, data, 30_000); // 30 sec TTL
  },

  // Dashboard stats - per user, short TTL
  async getDashboardStats(userId: string): Promise<unknown | null> {
    return queryCacheGet('dashboard', userId);
  },
  async setDashboardStats(userId: string, data: unknown): Promise<void> {
    return queryCacheSet('dashboard', userId, data, 15_000); // 15 sec TTL
  },
  async invalidateDashboardStats(userId: string): Promise<void> {
    return queryCacheInvalidate('dashboard', userId);
  },
};
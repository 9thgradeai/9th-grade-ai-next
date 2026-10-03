import { describe, it, expect, vi, afterEach } from "vitest";
import {
  queryCacheGet,
  queryCacheSet,
  clearQueryCache,
  QueryCache,
} from "~backend/infrastructure/cache/query-cache";

afterEach(() => {
  clearQueryCache();
  vi.useRealTimers();
});

describe("query cache memory fallback", () => {
  it("returns fresh entries within TTL", async () => {
    await queryCacheSet("t", "k1", { v: 1 }, 60_000);
    expect(await queryCacheGet("t", "k1")).toEqual({ v: 1 });
  });

  it("expires entries past TTL like Redis PX", async () => {
    vi.useFakeTimers();
    await queryCacheSet("t", "k2", { v: 2 }, 1_000);
    expect(await queryCacheGet("t", "k2")).toEqual({ v: 2 });
    vi.advanceTimersByTime(2_000);
    expect(await queryCacheGet("t", "k2")).toBeNull();
  });
});

describe("intelligence cache", () => {
  it("round-trips per user+scope and invalidates per user", async () => {
    await QueryCache.setIntelligence("u1", "analytics", { a: 1 });
    await QueryCache.setIntelligence("u1", "pulse", { p: 1 });
    await QueryCache.setIntelligence("u2", "analytics", { a: 2 });
    expect(await QueryCache.getIntelligence("u1", "analytics")).toEqual({ a: 1 });
    expect(await QueryCache.getIntelligence("u1", "pulse")).toEqual({ p: 1 });

    await QueryCache.invalidateIntelligence("u1");
    expect(await QueryCache.getIntelligence("u1", "analytics")).toBeNull();
    expect(await QueryCache.getIntelligence("u1", "pulse")).toBeNull();
    // Other users are untouched.
    expect(await QueryCache.getIntelligence("u2", "analytics")).toEqual({ a: 2 });
  });

  it("separates window variants", async () => {
    await QueryCache.setIntelligence("u1", "full", { w: 7 }, 7);
    expect(await QueryCache.getIntelligence("u1", "full", 7)).toEqual({ w: 7 });
    expect(await QueryCache.getIntelligence("u1", "full", 30)).toBeNull();
    expect(await QueryCache.getIntelligence("u1", "full")).toBeNull();
  });
});

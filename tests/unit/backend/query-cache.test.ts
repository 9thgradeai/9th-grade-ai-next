import { describe, it, expect, vi, afterEach } from "vitest";
import {
  queryCacheGet,
  queryCacheSet,
  clearQueryCache,
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

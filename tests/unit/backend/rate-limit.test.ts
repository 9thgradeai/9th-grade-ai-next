import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import {
  assertLoginAllowed,
  enforceAiQuotas,
  getRateLimitKey,
  resetRateLimitStore,
  getClientKey,
} from "~backend/rate-limit";
import { InMemoryRateLimitStore } from "~backend/infrastructure/cache/rate-limit-memory";
import { getRateLimitStore } from "~backend/infrastructure/cache";

function reqWithIp(ip: string): Request {
  return new Request("http://local/api/x", { headers: { "x-forwarded-for": ip } });
}

beforeEach(async () => {
  vi.unstubAllEnvs();
  await resetRateLimitStore();
});

describe("store selection (Phase 8)", () => {
  it("defaults to the in-memory store when REDIS_URL is absent", () => {
    expect(getRateLimitStore().name).toBe("memory");
  });

  it("memory store implements fixed-window semantics identical to the legacy limiter", async () => {
    const store = new InMemoryRateLimitStore();
    const first = await store.consume("k", 2, 1000);
    const second = await store.consume("k", 2, 1000);
    const third = await store.consume("k", 2, 1000);
    expect([first.allowed, second.allowed, third.allowed]).toEqual([true, true, false]);
    expect(third.resetAt).toBeGreaterThan(Date.now());
  });
});

describe("per-account login throttle", () => {
  beforeEach(() => {
    // Raise the per-IP bucket so these tests exercise ONLY the account bucket.
    vi.stubEnv("RL_LOGIN_PER_MIN", "100");
  });
  it("blocks an account even when the attacker rotates IPs", async () => {
    const email = "victim@example.com";
    // 10/hour per account (default). Burn it from three different IPs.
    for (let i = 0; i < 10; i++) {
      await assertLoginAllowed(reqWithIp(`10.0.0.${i % 3}`), email);
    }
    await expect(assertLoginAllowed(reqWithIp("99.9.9.9"), email)).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMIT_EXCEEDED",
    });
  });

  it("keeps other accounts unaffected", async () => {
    for (let i = 0; i < 10; i++) {
      await assertLoginAllowed(reqWithIp("10.1.1.1"), "a@example.com");
    }
    await expect(assertLoginAllowed(reqWithIp("10.1.1.1"), "b@example.com")).resolves.toBeUndefined();
  });

  it("is case/whitespace-insensitive per account", async () => {
    for (let i = 0; i < 10; i++) {
      await assertLoginAllowed(reqWithIp("10.2.2.2"), "User@Example.com ");
    }
    await expect(assertLoginAllowed(reqWithIp("10.2.2.2"), "user@example.com")).rejects.toMatchObject(
      { statusCode: 429 },
    );
  });
});

describe("enforceAiQuotas", () => {
  it("throws on minute overflow with the product message", async () => {
    vi.stubEnv("RL_AI_PER_MIN", "1");
    await enforceAiQuotas(reqWithIp("1.1.1.1"), "tutor", "u1"); // consumes the 1
    await expect(enforceAiQuotas(reqWithIp("1.1.1.1"), "tutor", "u1")).rejects.toMatchObject({
      statusCode: 429,
      message: "Too many AI requests. Please wait a moment.",
    });
  });

  it("consults the DB usage ledger as the authoritative daily backstop", async () => {
    vi.stubEnv("RL_AI_DAILY", "60");
    // Store counters empty, but ledger says the daily spend is exhausted.
    vi.mocked(prisma.aIUsage.count).mockResolvedValue(60);

    await expect(enforceAiQuotas(reqWithIp("2.2.2.2"), "solver", "u2")).rejects.toMatchObject({
      statusCode: 429,
      message: "Daily AI solver limit reached. Come back tomorrow!",
    });
    expect(prisma.aIUsage.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: "u2" }) }),
    );
  });

  it("passes when both store and ledger are under quota", async () => {
    vi.mocked(prisma.aIUsage.count).mockResolvedValue(5);
    await expect(enforceAiQuotas(reqWithIp("3.3.3.3"), "assistant", "u3")).resolves.toBeUndefined();
  });
});

describe("client identity", () => {
  it("TRUST_CLIENT_IP=false collapses anonymous callers into one opaque bucket", () => {
    vi.stubEnv("TRUST_CLIENT_IP", "false");
    expect(getClientKey(reqWithIp("8.8.8.8"))).toBe("opaque");
    expect(getRateLimitKey(reqWithIp("8.8.8.8"), "route")).toBe("route:opaque");
  });

  it("by default trusts platform headers for anonymous keys", () => {
    expect(getRateLimitKey(reqWithIp("8.8.8.8"), "route")).toContain("8.8.8.8");
  });

  it("authenticated callers are keyed by user id regardless of IP", () => {
    expect(getRateLimitKey(reqWithIp("8.8.8.8"), "ai:tutor", "u9")).toBe("ai:tutor:user:u9");
  });
});

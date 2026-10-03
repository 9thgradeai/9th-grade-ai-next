import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "~backend/db";
import { computeStreak } from "~backend/repositories/analytics.repository";

function utcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-23T14:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("computeStreak (server-authoritative streaks)", () => {
  it("returns 0 when the user has no attempts", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);
    expect(await computeStreak("u1")).toBe(0);
  });

  it("counts consecutive days ending today", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { day: utcDay(0) },
      { day: utcDay(1) },
      { day: utcDay(2) },
    ] as never);
    expect(await computeStreak("u1")).toBe(3);
  });

  it("anchors on yesterday when nothing was studied today", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { day: utcDay(1) },
      { day: utcDay(2) },
    ] as never);
    expect(await computeStreak("u1")).toBe(2);
  });

  it("returns 0 when the most recent activity is two days old", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ day: utcDay(2) }] as never);
    expect(await computeStreak("u1")).toBe(0);
  });

  it("stops counting at a gap in the activity log", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { day: utcDay(0) },
      { day: utcDay(1) },
      // gap on day 2
      { day: utcDay(3) },
      { day: utcDay(4) },
    ] as never);
    expect(await computeStreak("u1")).toBe(2);
  });

  it("credits post-midnight-Dhaka attempts to the Dhaka day (P-C2)", async () => {
    // 18:30 UTC = 00:30 Dhaka next day. The DB groups by Dhaka day, so the
    // row arrives keyed 2026-08-24 while UTC still says Aug 23.
    vi.setSystemTime(new Date("2026-08-23T18:30:00.000Z"));
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ day: "2026-08-24" }] as never);
    expect(await computeStreak("u1")).toBe(1);
  });

  it("anchors on Dhaka yesterday when today is untouched", async () => {
    vi.setSystemTime(new Date("2026-08-23T18:30:00.000Z"));
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { day: "2026-08-23" },
      { day: "2026-08-22" },
    ] as never);
    expect(await computeStreak("u1")).toBe(2);
  });
});

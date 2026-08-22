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
});

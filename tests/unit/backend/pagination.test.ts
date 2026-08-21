import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "~backend/db";
import { getNotifications } from "~backend/services/content";
import {
  buildActivityWindow,
  aggregateDailyActivity,
} from "~backend/repositories/analytics.repository";

beforeEach(() => {
  vi.clearAllMocks();
});

function notifRow(id: number) {
  return {
    id,
    title: `t${id}`,
    message: "m",
    type: "INFO",
    timestamp: new Date(Date.now() - id * 1000),
    read: false,
    reads: [],
  };
}

describe("getNotifications (keyset pagination)", () => {
  it("applies the DB cursor + skip and returns nextCursor only on a full page", async () => {
    const rows = [notifRow(10), notifRow(9), notifRow(8)];
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue(rows as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(42);

    const page = await getNotifications("userA", { limit: 3, cursorId: 11 });

    expect(prisma.appNotification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        cursor: { id: 11 },
        skip: 1,
        take: 3,
      }),
    );
    expect(page.items.map((n) => n.id)).toEqual([10, 9, 8]);
    expect(page.nextCursor).toBe(8); // full page ⇒ more may exist
    expect(page.total).toBe(42);
  });

  it("returns null nextCursor on a partial final page", async () => {
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue([notifRow(2)] as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(1);

    const page = await getNotifications("userA", { limit: 20 });
    expect(page.nextCursor).toBeNull();
    expect(prisma.appNotification.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ cursor: expect.anything() }),
    );
  });

  it("clamps limit into a sane range", async () => {
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(0);

    await getNotifications("userA", { limit: 99999 });
    expect(vi.mocked(prisma.appNotification.findMany).mock.calls[0][0].take).toBe(50);

    await getNotifications("userA", { limit: -5 });
    expect(vi.mocked(prisma.appNotification.findMany).mock.calls[1][0].take).toBe(1);
  });
});

describe("buildActivityWindow (pure zero-fill)", () => {
  it("expands sparse aggregates into a continuous 7-day window", () => {
    const now = Date.UTC(2026, 7, 22, 12, 0, 0);
    const rows = [
      { date: "2026-08-22", answered: 5, correct: 4 },
      { date: "2026-08-18", answered: 2, correct: 1 },
    ];
    const window = buildActivityWindow(rows, 7, now);
    expect(window).toHaveLength(7);
    expect(window[0].answered).toBe(0);
    const hit18 = window.find((d) => d.date === "2026-08-18");
    expect(hit18).toEqual({ date: "2026-08-18", answered: 2, correct: 1 });
    const today = window[window.length - 1];
    expect(today).toEqual({ date: "2026-08-22", answered: 5, correct: 4 });
  });
});

describe("aggregateDailyActivity (DB-side grouping)", () => {
  it("scopes the grouped query to exactly one user", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { date: "2026-08-22", answered: 3, correct: 2 },
    ] as never);

    const out = await aggregateDailyActivity("userA", 7);
    expect(out).toEqual([{ date: "2026-08-22", answered: 3, correct: 2 }]);
    expect(vi.mocked(prisma.$queryRaw).mock.calls[0].slice(1)).toEqual(["userA", 7]);
  });
});

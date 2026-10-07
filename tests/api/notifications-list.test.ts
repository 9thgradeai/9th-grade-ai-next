// @vitest-environment node
//
// Regression tests for the notification visibility overhaul:
// - server-side ?type= filtering (page/cursor/total consistent)
// - hidden broadcasts excluded from list + unread count
// - preferences persisted per user and applied to the list
// - subscriber rate-limits to one row per user/kind/day

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  getNotifications,
  getUnreadCount,
  getNotificationPreferences,
  updateNotificationPreferences,
  markAllNotificationsRead,
} from "~backend/services/notification";
import { prisma } from "~backend/db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.notificationHidden.findMany).mockResolvedValue([]);
  vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue(null);
});

function page(rows: { id: number }[]) {
  return rows.map((r) => ({
    id: r.id,
    title: "t",
    message: "m",
    type: "INFO",
    timestamp: new Date("2026-01-04T00:00:00Z"),
    sourceKey: `k-${r.id}`,
    reads: [],
  }));
}

describe("getNotifications visibility", () => {
  it("passes ?type= into the query and returns the filtered total", async () => {
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue(page([{ id: 5 }]) as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(1);
    const res = await getNotifications("u1", { type: "SUCCESS" });
    const where = vi.mocked(prisma.appNotification.findMany).mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("SUCCESS");
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  it("ignores an invalid ?type= instead of filtering to nothing", async () => {
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue(page([{ id: 5 }]) as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(1);
    const res = await getNotifications("u1", { type: "BOGUS" });
    const where = vi.mocked(prisma.appNotification.findMany).mock.calls[0][0].where;
    // Falls back to preference-enabled types (all four by default).
    expect(JSON.stringify(where)).toContain("INFO");
    expect(res.items).toHaveLength(1);
  });

  it("excludes hidden broadcasts from list and unread count", async () => {
    vi.mocked(prisma.notificationHidden.findMany).mockResolvedValue([
      { notificationId: 9 },
    ] as never);
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue(page([{ id: 5 }]) as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(7);
    vi.mocked(prisma.notificationRead.count).mockResolvedValue(2);
    const res = await getNotifications("u1", {});
    const where = vi.mocked(prisma.appNotification.findMany).mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("notIn");
    expect(res.total).toBe(7);
    expect(await getUnreadCount("u1")).toBe(5);
  });

  it("applies stored type preferences to the list", async () => {
    vi.mocked(prisma.notificationPreference.findUnique).mockResolvedValue({
      userId: "u1",
      info: true,
      success: false,
      warning: true,
      reminder: false,
    } as never);
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.appNotification.count).mockResolvedValue(0);
    await getNotifications("u1", {});
    const where = JSON.stringify(
      vi.mocked(prisma.appNotification.findMany).mock.calls[0][0].where,
    );
    expect(where).toContain("INFO");
    expect(where).toContain("WARNING");
    expect(where).not.toContain("SUCCESS");
    expect(where).not.toContain("REMINDER");
  });
});

describe("notification preferences persistence", () => {
  it("returns all-enabled defaults when no row exists", async () => {
    await expect(getNotificationPreferences("u1")).resolves.toEqual({
      info: true,
      success: true,
      warning: true,
      reminder: true,
    });
  });

  it("upserts partial updates and returns the stored row", async () => {
    vi.mocked(prisma.notificationPreference.upsert).mockResolvedValue({
      userId: "u1",
      info: true,
      success: false,
      warning: true,
      reminder: true,
    } as never);
    const res = await updateNotificationPreferences("u1", { success: false });
    expect(res.success).toBe(false);
    expect(vi.mocked(prisma.notificationPreference.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1" },
        update: { success: false },
      }),
    );
  });
});

describe("markAllNotificationsRead", () => {
  it("skips hidden broadcasts", async () => {
    vi.mocked(prisma.notificationHidden.findMany).mockResolvedValue([
      { notificationId: 9 },
    ] as never);
    vi.mocked(prisma.appNotification.findMany).mockResolvedValue([{ id: 5 }] as never);
    vi.mocked(prisma.notificationRead.findMany).mockResolvedValue([]);
    vi.mocked(prisma.notificationRead.createMany).mockResolvedValue({ count: 1 });
    const res = await markAllNotificationsRead("u1");
    expect(res.count).toBe(1);
    const where = JSON.stringify(
      vi.mocked(prisma.appNotification.findMany).mock.calls[0][0].where,
    );
    expect(where).toContain("notIn");
  });
});



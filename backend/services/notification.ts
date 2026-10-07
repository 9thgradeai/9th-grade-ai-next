import "server-only";

import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";

// ── Types ──

export type CreateNotificationInput = {
  userId?: string;
  title: string;
  message: string;
  type?: "INFO" | "SUCCESS" | "WARNING" | "REMINDER";
  sourceKey?: string;
};

export type NotificationDTO = {
  id: number;
  title: string;
  message: string;
  type: string;
  timestamp: string;
  read: boolean;
  sourceKey: string;
};

export type NotificationTypeFilter = "INFO" | "SUCCESS" | "WARNING" | "REMINDER";

export type NotificationPreferences = {
  info: boolean;
  success: boolean;
  warning: boolean;
  reminder: boolean;
};

const DEFAULT_PREFS: NotificationPreferences = {
  info: true,
  success: true,
  warning: true,
  reminder: true,
};

const PREF_TO_TYPE: Record<keyof NotificationPreferences, NotificationTypeFilter> = {
  info: "INFO",
  success: "SUCCESS",
  warning: "WARNING",
  reminder: "REMINDER",
};

// ── Visibility ─────────────────────────────────────────────
// A notification is visible to a user when it is theirs-or-broadcast, NOT
// hidden by them, and its type is enabled in their preferences.

async function hiddenIdsFor(userId: string): Promise<number[]> {
  const rows = await prisma.notificationHidden.findMany({
    where: { userId },
    select: { notificationId: true },
  });
  return rows.map((r) => r.notificationId);
}

async function enabledTypesFor(userId: string): Promise<NotificationTypeFilter[]> {
  const prefs = await getNotificationPreferences(userId);
  return (Object.keys(DEFAULT_PREFS) as (keyof NotificationPreferences)[]).filter(
    (k) => prefs[k],
  ).map((k) => PREF_TO_TYPE[k]);
}

function audienceWhere(userId: string): { OR: ({ userId: null } | { userId: string })[] } {
  return { OR: [{ userId: null }, { userId }] };
}

// ── Core CRUD ──

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationDTO> {
  try {
    if (input.sourceKey) {
      const existing = await prisma.appNotification.findUnique({
        where: { sourceKey: input.sourceKey },
      });
      if (existing) {
        return toDTO(existing, false);
      }
    }

    const created = await prisma.appNotification.create({
      data: {
        userId: input.userId ?? null,
        title: input.title,
        message: input.message,
        type: input.type ?? "INFO",
        sourceKey: input.sourceKey ?? "",
      },
    });

    return toDTO(created, false);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to create notification");
  }
}

export async function createBulkNotifications(
  inputs: CreateNotificationInput[],
): Promise<NotificationDTO[]> {
  try {
    const results: NotificationDTO[] = [];

    for (const input of inputs) {
      results.push(await createNotification(input));
    }

    return results;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to create bulk notifications");
  }
}

export async function getNotifications(
  userId: string,
  opts: { limit?: number; cursorId?: number; type?: string } = {},
): Promise<{
  items: NotificationDTO[];
  nextCursor: number | null;
  total: number;
}> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 20)), 50);
  const requestedType =
    opts.type === "INFO" || opts.type === "SUCCESS" || opts.type === "WARNING" || opts.type === "REMINDER"
      ? (opts.type as NotificationTypeFilter)
      : undefined;
  try {
    const [hiddenIds, enabledTypes] = await Promise.all([
      hiddenIdsFor(userId),
      enabledTypesFor(userId),
    ]);
    // Explicit ?type= narrows; otherwise the user's stored preferences apply.
    const types = requestedType ? [requestedType] : enabledTypes;
    const where = {
      AND: [
        audienceWhere(userId),
        ...(hiddenIds.length > 0 ? [{ id: { notIn: hiddenIds } }] : []),
        // `in: []` matches nothing — disabling every type yields an empty
        // inbox rather than falling back to unfiltered.
        { type: { in: types } },
      ],
    };
    const [rows, total] = await Promise.all([
      prisma.appNotification.findMany({
        where,
        include: { reads: { where: { userId } } },
        orderBy: [{ timestamp: "desc" }, { id: "desc" }],
        ...(opts.cursorId
          ? { cursor: { id: opts.cursorId }, skip: 1 }
          : {}),
        take: limit,
      }),
      prisma.appNotification.count({ where }),
    ]);

    const items = rows.map((n) => toDTO(n, n.reads.length > 0));
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

    return { items, nextCursor, total };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to fetch notifications");
  }
}

// NOTE: single-item read lives in activity.ts (used by [id]/read). Do not
// re-add a duplicate here — it drifted before (two implementations).

export async function markAllNotificationsRead(
  userId: string,
): Promise<{ count: number }> {
  try {
    const hiddenIds = await hiddenIdsFor(userId);
    const unreadRows = await prisma.appNotification.findMany({
      where: {
        AND: [
          audienceWhere(userId),
          ...(hiddenIds.length > 0 ? [{ id: { notIn: hiddenIds } }] : []),
        ],
      },
      select: { id: true },
    });

    const unreadIds = unreadRows.map((r) => r.id);

    if (unreadIds.length === 0) {
      return { count: 0 };
    }

    const existingReads = await prisma.notificationRead.findMany({
      where: {
        userId,
        notificationId: { in: unreadIds },
      },
      select: { notificationId: true },
    });

    const existingSet = new Set(existingReads.map((r) => r.notificationId));
    const toInsert = unreadIds
      .filter((id) => !existingSet.has(id))
      .map((notificationId) => ({ userId, notificationId }));

    if (toInsert.length > 0) {
      await prisma.notificationRead.createMany({ data: toInsert });
    }

    return { count: toInsert.length };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to mark all notifications read");
  }
}

export async function deleteUserNotification(
  userId: string,
  notificationId: number,
): Promise<{ removed: boolean }> {
  try {
    const notification = await prisma.appNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new AppError(404, "Notification not found.", "NOT_FOUND");
    }

    if (notification.userId === userId) {
      await prisma.appNotification.delete({ where: { id: notificationId } });
    } else {
      // Shared rows are never deleted — hide them for this user only, so a
      // refetch can't resurrect what the user dismissed.
      await prisma.notificationHidden.upsert({
        where: { userId_notificationId: { userId, notificationId } },
        update: {},
        create: { userId, notificationId },
      });
    }

    return { removed: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to delete user notification");
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const hiddenIds = await hiddenIdsFor(userId);
    const audience = {
      AND: [
        audienceWhere(userId),
        ...(hiddenIds.length > 0 ? [{ id: { notIn: hiddenIds } }] : []),
      ],
    };
    const totalMatching = await prisma.appNotification.count({
      where: audience,
    });

    const alreadyRead = await prisma.notificationRead.count({
      where: {
        userId,
        ...(hiddenIds.length > 0 ? { notificationId: { notIn: hiddenIds } } : {}),
        notification: {
          OR: [{ userId: null }, { userId }],
        },
      },
    });

    return Math.max(0, totalMatching - alreadyRead);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to get unread count");
  }
}

// ── Preferences (persisted per user; absent row = all enabled) ──

export async function getNotificationPreferences(
  userId: string,
): Promise<NotificationPreferences> {
  try {
    const row = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!row) return { ...DEFAULT_PREFS };
    return { info: row.info, success: row.success, warning: row.warning, reminder: row.reminder };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to fetch notification preferences");
  }
}

export async function updateNotificationPreferences(
  userId: string,
  prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  try {
    const row = await prisma.notificationPreference.upsert({
      where: { userId },
      update: {
        ...(typeof prefs.info === "boolean" ? { info: prefs.info } : {}),
        ...(typeof prefs.success === "boolean" ? { success: prefs.success } : {}),
        ...(typeof prefs.warning === "boolean" ? { warning: prefs.warning } : {}),
        ...(typeof prefs.reminder === "boolean" ? { reminder: prefs.reminder } : {}),
      },
      create: {
        userId,
        info: prefs.info ?? true,
        success: prefs.success ?? true,
        warning: prefs.warning ?? true,
        reminder: prefs.reminder ?? true,
      },
    });
    return { info: row.info, success: row.success, warning: row.warning, reminder: row.reminder };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to update notification preferences");
  }
}

// ── Helpers ──

function toDTO(
  row: {
    id: number;
    title: string;
    message: string;
    type: string;
    timestamp: Date;
    sourceKey: string;
  },
  read: boolean,
): NotificationDTO {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    timestamp: row.timestamp.toISOString(),
    read,
    sourceKey: row.sourceKey,
  };
}

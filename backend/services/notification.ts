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
  opts: { limit?: number; cursorId?: number } = {},
): Promise<{
  items: NotificationDTO[];
  nextCursor: number | null;
  total: number;
}> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 20)), 50);
  try {
    const rows = await prisma.appNotification.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
      },
      include: { reads: { where: { userId } } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      ...(opts.cursorId
        ? { cursor: { id: opts.cursorId }, skip: 1 }
        : {}),
      take: limit,
    });

    const total = await prisma.appNotification.count({
      where: {
        OR: [{ userId: null }, { userId }],
      },
    });

    const items = rows.map((n) => toDTO(n, n.reads.length > 0));
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

    return { items, nextCursor, total };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to fetch notifications");
  }
}

export async function markNotificationRead(
  userId: string,
  notificationId: number,
): Promise<{ read: boolean }> {
  try {
    const notification = await prisma.appNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new AppError(404, "Notification not found.", "NOT_FOUND");
    }

    await prisma.notificationRead.upsert({
      where: { userId_notificationId: { userId, notificationId } },
      update: {},
      create: { userId, notificationId },
    });

    return { read: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to mark notification read");
  }
}

export async function markAllNotificationsRead(
  userId: string,
): Promise<{ count: number }> {
  try {
    const unreadRows = await prisma.appNotification.findMany({
      where: {
        OR: [{ userId: null }, { userId }],
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

export async function deleteNotification(
  notificationId: number,
): Promise<{ deleted: boolean }> {
  try {
    const notification = await prisma.appNotification.findUnique({
      where: { id: notificationId },
    });
    if (!notification) {
      throw new AppError(404, "Notification not found.", "NOT_FOUND");
    }

    await prisma.appNotification.delete({ where: { id: notificationId } });
    return { deleted: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to delete notification");
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
      await prisma.notificationRead.upsert({
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
    const totalMatching = await prisma.appNotification.count({
      where: {
        OR: [{ userId: null }, { userId }],
      },
    });

    const alreadyRead = await prisma.notificationRead.count({
      where: {
        userId,
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

export async function getNotificationsByType(
  userId: string,
  type: string,
): Promise<NotificationDTO[]> {
  try {
    const rows = await prisma.appNotification.findMany({
      where: {
        AND: [
          {
            OR: [{ userId: null }, { userId }],
          },
          { type: type as "INFO" | "SUCCESS" | "WARNING" | "REMINDER" },
        ],
      },
      include: { reads: { where: { userId } } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    });

    return rows.map((n) => toDTO(n, n.reads.length > 0));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to fetch notifications by type");
  }
}

// ── Preferences (in-memory default, no DB migration) ──

export async function getNotificationPreferences(
  _userId: string,
): Promise<NotificationPreferences> {
  return { ...DEFAULT_PREFS };
}

export async function updateNotificationPreferences(
  _userId: string,
  _prefs: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return { ...DEFAULT_PREFS };
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

// backend/services/admin.ts — Admin-only operations (user management).
// Must be called from server context with an authenticated admin user.

import "server-only";

import { prisma } from "~backend/db";
import { AppError, NotFoundError, InternalServerError } from "~backend/errors";
import { revokeAllSessions } from "./user";

export type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  handle: string;
  role: string;
  emailVerified: boolean;
  onboarded: boolean;
  authProvider: string;
  createdAt: Date;
  _count: { attempts: number; mockTestResults: number; aiConversations: number };
};

export type AdminUserDetail = Awaited<ReturnType<typeof prisma.user.findUnique>> & {
  _count: Record<string, number>;
};

/** List users with pagination and optional search. */
export async function listUsers(opts: {
  page: number;
  limit: number;
  search: string;
}): Promise<{ users: AdminUserListItem[]; total: number; page: number; limit: number; totalPages: number }> {
  try {
    const { page, limit, search } = opts;
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
            { handle: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          handle: true,
          role: true,
          emailVerified: true,
          onboarded: true,
          authProvider: true,
          createdAt: true,
          _count: { select: { attempts: true, mockTestResults: true, aiConversations: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to list users");
  }
}

/** Get a single user's details (admin view, includes progress + counts). */
export async function getUserDetail(userId: string): Promise<AdminUserDetail> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        progress: true,
        _count: {
          select: {
            attempts: true,
            mockTestResults: true,
            aiConversations: true,
            bookmarks: true,
            flashcardReviews: true,
            studyTaskCompletions: true,
            notifications: true,
            dailyQuizParticipations: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundError("User not found");
    return user;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to get user details");
  }
}

/** Perform an admin action on a user (ban, unban, revoke sessions). */
export async function adminAction(
  userId: string,
  action: "ban" | "unban" | "revoke_sessions",
): Promise<{ success: boolean; action: string }> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    if (action === "ban") {
      await prisma.user.update({
        where: { id: userId },
        data: { role: "BANNED" as "STUDENT" | "ADMIN" | "BANNED" },
      });
      await revokeAllSessions(userId);
    } else if (action === "unban") {
      await prisma.user.update({
        where: { id: userId },
        data: { role: "STUDENT" },
      });
    } else if (action === "revoke_sessions") {
      await revokeAllSessions(userId);
    } else {
      throw new AppError(400, "Invalid action", "VALIDATION_ERROR");
    }

    return { success: true, action };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to perform admin action");
  }
}

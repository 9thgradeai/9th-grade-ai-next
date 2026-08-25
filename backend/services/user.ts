// src/lib/services/user.ts — per-user state (progress, bookmarks).
// Must be called from server context with the authenticated userId.

import "server-only";

import { hash, compare } from "bcryptjs";
import { prisma } from "~backend/db";
import { getSessionUser } from "~backend/auth";
import {
  AppError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  UnauthorizedError,
  ForbiddenError,
} from "~backend/errors";
import type { UserProgressDTO } from "@/lib/types";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  handle: string;
  passwordHash: string;
  tokenVersion: number;
  role: "student" | "admin";
  createdAt: string;
};

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  try {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      createdAt: u.createdAt.toISOString(),
    };
  } catch {
    throw new InternalServerError("Failed to fetch user by email");
  }
}

export async function createUser({
  name,
  email,
  password,
  handle = email.split("@")[0],
}: {
  name: string;
  email: string;
  password: string;
  handle?: string;
}): Promise<UserRecord> {
  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new ConflictError("A user with that email already exists.");
    }

    const passwordHash = await hash(password, 10);

    // User + initial progress row commit atomically — a failure creating the
    // progress row rolls back the user instead of leaving an orphaned account
    // without progress. A concurrent registration with the same email hits the
    // unique constraint (inside or around the transaction) and surfaces as a
    // 409 conflict rather than a 500.
    const isUniqueViolation = (err: unknown): boolean =>
      !!err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";

    let u;
    try {
      u = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { name, email: email.toLowerCase(), handle, passwordHash, role: "STUDENT" },
        });
        await tx.userProgress.create({ data: { userId: created.id } });
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("A user with that email already exists.");
      }
      throw err;
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: "student",
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to create user");
  }
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return compare(plain, hashStr);
  } catch {
    return false;
  }
}

/**
 * Pre-computed bcrypt digest used to equalize timing when the submitted email
 * does not exist. Running the same single compare on both the "no such user"
 * and "wrong password" paths removes the ~100ms oracle that let attackers
 * enumerate registered emails from response latency.
 */
export const DUMMY_PASSWORD_HASH = "$2b$10$mfEU02aBWld.H0jui8HgCuZz9R1S7WV8QTsnKc3JsxZkLjC4WbMCK";

/** Resolve the authenticated user's id from the request cookies. */
export async function getUserIdFromRequest(
  req: Request,
): Promise<string | null> {
  try {
    // Delegates to getSessionUser so every session check (JWT signature,
    // existence, tokenVersion) stays in one place.
    const user = await getSessionUser(req);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export type AuthedUser = { id: string; email: string; role: "student" | "admin" };

/** Resolve the authenticated user (id + role) from the request cookies. */
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  try {
    // Delegates to getSessionUser so every session check stays in one place.
    const user = await getSessionUser(req);
    if (!user) return null;
    return { id: user.id, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

/**
 * Gate for admin-only surfaces. Throws UnauthorizedError (401) when no valid
 * session exists and ForbiddenError (403) when the session lacks the role.
 * Returns the authenticated user on success.
 */
export async function requireRole(
  req: Request,
  roles: Array<AuthedUser["role"]>,
): Promise<AuthedUser> {
  const user = await getAuthedUser(req);
  if (!user) {
    throw new UnauthorizedError("Authentication required");
  }
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
  }
  return user;
}

async function ensureProgress(userId: string) {
  return prisma.userProgress.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}

export async function patchUserProgress(
  userId: string,
  patch: Partial<{
    points: number;
    streak: number;
    accuracy: number;
    questionsAnswered: number;
    flashcardsReviewed: number;
    aiQuestionsAsked: number;
    examsAttempted: number;
    rank: number;
  }>,
): Promise<UserProgressDTO> {
  try {
    await ensureProgress(userId);
    const p = await prisma.userProgress.update({ where: { userId }, data: patch });
    return {
      points: p.points,
      streak: p.streak,
      accuracy: p.accuracy,
      questionsAnswered: p.questionsAnswered,
      flashcardsReviewed: p.flashcardsReviewed,
      aiQuestionsAsked: p.aiQuestionsAsked,
      examsAttempted: p.examsAttempted,
      rank: p.rank,
    };
  } catch {
    throw new InternalServerError("Failed to patch user progress");
  }
}

export async function getBookmarkedQuestionIds(userId: string): Promise<number[]> {
  try {
    const rows = await prisma.bookmark.findMany({
      where: { userId },
      select: { questionId: true },
    });
    return rows.map((r) => r.questionId);
  } catch {
    throw new InternalServerError("Failed to fetch bookmarks");
  }
}

export async function toggleBookmark(
  userId: string,
  questionId: number,
): Promise<{ bookmarked: boolean }> {
  try {
    const existing = await prisma.bookmark.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
    if (existing) {
      await prisma.bookmark.delete({ where: { userId_questionId: { userId, questionId } } });
      return { bookmarked: false };
    }
    await prisma.bookmark.create({ data: { userId, questionId } });
    return { bookmarked: true };
  } catch {
    throw new InternalServerError("Failed to toggle bookmark");
  }
}

export async function toggleStudyTask(
  userId: string,
  taskId: number,
): Promise<{ completed: boolean }> {
  try {
    // Any task may be toggled (template or user-created) — completion state is
    // per-user in StudyTaskCompletion, never on the shared row.
    const task = await prisma.studyTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new NotFoundError("Task not found");

    return prisma.$transaction(async (tx) => {
      const existing = await tx.studyTaskCompletion.findUnique({
        where: { userId_taskId: { userId, taskId } },
      });
      if (existing) {
        await tx.studyTaskCompletion.delete({ where: { id: existing.id } });
        return { completed: false };
      }
      await tx.studyTaskCompletion.create({ data: { userId, taskId } });
      return { completed: true };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to toggle study task");
  }
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      createdAt: u.createdAt.toISOString(),
    };
  } catch {
    throw new InternalServerError("Failed to fetch user");
  }
}

export async function updateUserProfile(
  userId: string,
  patch: { name?: string },
): Promise<UserRecord> {
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError("User not found");

    const u = await prisma.user.update({
      where: { id: userId },
      data: { name: patch.name?.trim() ?? existing.name },
    });

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to update profile");
  }
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ tokenVersion: number }> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const match = await verifyPassword(user.passwordHash, currentPassword);
    if (!match) {
      throw new AppError(
        401,
        "Current password is incorrect.",
        "INVALID_CURRENT_PASSWORD",
      );
    }

    // Bumping tokenVersion invalidates every JWT minted before this point —
    // stolen cookies stop working after a password change. The caller issues
    // a fresh token for the CURRENT session so the user isn't logged out.
    const passwordHash = await hash(newPassword, 10);
    const tokenVersion = user.tokenVersion + 1;
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion },
    });
    return { tokenVersion };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to change password");
  }
}

/**
 * Invalidate every active session for the user ("log out everywhere") by
 * bumping their tokenVersion. Also affects the calling device — the client
 * clears its own cookie afterwards.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("User not found");
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to revoke sessions");
  }
}

export async function deleteUserAccount(userId: string): Promise<void> {
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError("User not found");
    // Related rows cascade (see schema onDelete: Cascade / SetNull).
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to delete account");
  }
}

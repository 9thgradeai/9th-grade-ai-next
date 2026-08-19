// src/lib/services/user.ts — per-user state (progress, bookmarks).
// Must be called from server context with the authenticated userId.

import "server-only";

import { hash, compare } from "bcryptjs";
import { prisma } from "~backend/db";
import { verifySession } from "~backend/auth";
import {
  AppError,
  NotFoundError,
  ConflictError,
  InternalServerError,
} from "~backend/errors";
import type { UserProgressDTO } from "@/lib/types";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  handle: string;
  passwordHash: string;
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
    const u = await prisma.user.create({
      data: { name, email: email.toLowerCase(), handle, passwordHash, role: "STUDENT" },
    });

    await prisma.userProgress.upsert({
      where: { userId: u.id },
      update: {},
      create: { userId: u.id },
    });

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
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

/** Resolve the authenticated user's id from the request cookies. */
export async function getUserIdFromRequest(
  req: Request,
): Promise<string | null> {
  try {
    const cookie = req.headers.get("cookie") ?? "";
    const match = cookie.match(/auth_token=([^;]+)/);
    if (!match) return null;
    const payload = await verifySession(match[1]);
    if (!payload?.email || typeof payload.email !== "string") return null;
    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    return user?.id ?? null;
  } catch {
    return null;
  }
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
    // Only the task's owner may toggle it — look up scoped to this user.
    const task = await prisma.studyTask.findFirst({ where: { id: taskId, userId } });
    if (!task) throw new NotFoundError("Task not found");
    const completed = !task.completed;
    await prisma.studyTask.update({
      where: { id: taskId },
      data: { completed },
    });
    return { completed };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to toggle study task");
  }
}

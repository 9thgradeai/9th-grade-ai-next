// backend/services/activity.ts — per-user activity recording.
// Grades submitted answers, persists attempts, and updates UserProgress.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";
import { recomputeAndAward } from "~backend/repositories/progress.repository";
import { emit } from "~backend/events/bus";

export type SubmittedAnswer = {
  questionId: number;
  selected: string;
};

export type SubmissionSummary = {
  correct: number;
  total: number;
  score: number; // percentage 0-100
  pointsEarned: number;
};

const POINTS_PER_CORRECT = 10;

type TxClient = Prisma.TransactionClient;
type AttemptRow = {
  userId: string;
  questionId: number | null;
  subjectId: number | null;
  subjectName: string;
  topic: string;
  correct: boolean;
  source: string;
};

/**
 * Persist attempts and recompute progress ATOMICALLY. Every submission flow
 * (practice / daily / exam) funnels through here so a crash between writing
 * attempts and updating progress can never leave the two inconsistent, and
 * concurrent submissions cannot interleave stale count-then-update writes.
 */
async function recordAttemptsAtomically(
  tx: TxClient,
  userId: string,
  attempts: AttemptRow[],
  pointsEarned: number,
  examsIncrement = 0,
): Promise<void> {
  if (attempts.length > 0) {
    await tx.questionAttempt.createMany({ data: attempts });
  }
  await recomputeAndAward(tx, userId, pointsEarned, examsIncrement);
}

function gradeAnswers(
  answers: SubmittedAnswer[],
  reference: Array<{ id: number; correctAnswer: string }>,
): { correct: number; total: number } {
  if (!Array.isArray(answers)) {
    throw new AppError(400, "answers must be an array.", "VALIDATION_ERROR");
  }
  // The runtime payload may contain malformed entries; validate defensively.
  const raw = answers as Array<Partial<SubmittedAnswer> | null>;
  const byId = new Map(reference.map((q) => [q.id, q.correctAnswer]));
  let correct = 0;
  for (const a of raw) {
    if (!a || !Number.isInteger(a.questionId) || typeof a.selected !== "string") {
      throw new AppError(400, "Each answer needs a numeric questionId and a selected string.", "VALIDATION_ERROR");
    }
    const right = byId.get(a.questionId as number);
    if (right === undefined) {
      throw new AppError(400, `Unknown questionId ${a.questionId}.`, "VALIDATION_ERROR");
    }
    if (a.selected.trim() === right.trim()) correct += 1;
  }
  return { correct, total: answers.length };
}

// ── Practice (Question table) ─────────────────────────────
export async function submitPracticeAnswers(
  userId: string,
  answers: SubmittedAnswer[],
): Promise<SubmissionSummary> {
  try {
    const ids = answers.map((a) => a.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: { id: true, correctAnswer: true, subjectId: true, topic: true, subject: { select: { nameBn: true } } },
    });
    const { correct, total } = gradeAnswers(answers, questions);
    const byId = new Map(questions.map((q) => [q.id, q]));

    const attempts = answers.map((a) => {
      const q = byId.get(a.questionId);
      return {
        userId,
        questionId: a.questionId,
        subjectId: q?.subjectId ?? null,
        subjectName: q?.subject ? q.subject.nameBn : "",
        topic: q?.topic ?? "",
        correct: a.selected.trim() === q?.correctAnswer.trim(),
        source: "practice",
      };
    });

    const pointsEarned = correct * POINTS_PER_CORRECT;
    await prisma.$transaction(async (tx) => {
      await recordAttemptsAtomically(tx, userId, attempts, pointsEarned);
    });
    // Domain event (Phase 11) — emitted only after the transaction committed.
    emit({ name: "PRACTICE_SUBMITTED", userId, correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0 });
    return { correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0, pointsEarned };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record practice answers");
  }
}

// ── Daily quiz (QuizQuestion table) ───────────────────────
// Phase 2: attempts + progress recompute + per-user participation now commit
// atomically. The legacy global flags on DailyQuiz are never written.
export async function submitDailyQuiz(
  userId: string,
  quizId: number,
  answers: SubmittedAnswer[],
): Promise<SubmissionSummary> {
  try {
    const quiz = await prisma.dailyQuiz.findUnique({
      where: { id: quizId },
      include: { questions: { select: { id: true, correctAnswer: true, subject: true, topic: true } } },
    });
    if (!quiz) {
      throw new AppError(404, "Daily quiz not found.", "NOT_FOUND");
    }

    const { correct, total } = gradeAnswers(answers, quiz.questions);
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const pointsEarned = correct * POINTS_PER_CORRECT;

    const attempts = answers.map((a) => {
      const q = byId.get(a.questionId);
      return {
        userId,
        questionId: null,
        subjectId: null,
        subjectName: q?.subject ?? "",
        topic: q?.topic ?? "",
        correct: a.selected.trim() === q?.correctAnswer.trim(),
        source: "daily",
      };
    });

    await prisma.$transaction(async (tx) => {
      await recordAttemptsAtomically(tx, userId, attempts, pointsEarned);
      await tx.dailyQuizParticipation.upsert({
        where: { userId_quizId: { userId, quizId } },
        update: {
          status: "COMPLETED",
          score,
          correct,
          total,
          pointsEarned,
          completedAt: new Date(),
        },
        create: {
          userId,
          quizId,
          status: "COMPLETED",
          score,
          correct,
          total,
          pointsEarned,
          completedAt: new Date(),
        },
      });
    });

    emit({ name: "DAILY_QUIZ_COMPLETED", userId, quizId, score });
    return { correct, total, score, pointsEarned };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record daily quiz");
  }
}

// ── Notifications (read markers) ──────────────────────────
export async function markNotificationRead(
  userId: string,
  notificationId: number,
): Promise<{ read: boolean }> {
  try {
    const notification = await prisma.appNotification.findUnique({ where: { id: notificationId } });
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
// backend/services/activity.ts — per-user activity recording.
// Grades submitted answers, persists attempts, and updates UserProgress.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import type { MistakeErrorType, Prisma } from "@prisma/client";
import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";
import { recomputeAndAward } from "~backend/repositories/progress.repository";
import { emit } from "~backend/events/bus";
import type { AttemptFact } from "~backend/events/types";
import { classifyErrorType } from "./error-classifier";
import { recordQuestionAttempt } from "./question-progress";

export type SubmittedAnswer = {
  questionId: number;
  /** Single pick (legacy) or multi-pick set — both graded all-or-nothing. */
  selected: string | string[];
  /** Optional per-answer time (s) — drives error classification. */
  durationSec?: number;
  /** Optional learner self-confidence 0–100. */
  confidence?: number;
};

export type SubmissionSummary = {
  correct: number;
  total: number;
  score: number; // percentage 0-100
  pointsEarned: number;
  /** Wrong count (answered but incorrect). */
  wrong?: number;
  /** Negative marks deducted (wrong × penalty). */
  negativeMarks?: number;
  /** Net score: correct − wrong × penalty. */
  finalScore?: number;
  /** Penalty applied per wrong MCQ (0.25 Bank, 0.50 BCS). */
  penaltyPerWrong?: number;
  /** Per-question mastery feedback, keyed by questionId (mistake practice). */
  feedback?: Record<number, { masteryStatus: string; isMistake: boolean; justMastered: boolean }>;
};

const POINTS_PER_CORRECT = 10;

/** Clamp a client-reported duration into 0..6h (0 = not provided). */
function toDurationSec(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(Math.floor(value), 6 * 60 * 60);
  }
  return 0;
}

/** Clamp a client-reported confidence into 0..100 (null = not provided). */
function toConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  return null;
}

type TxClient = Prisma.TransactionClient;
type AttemptRow = {
  ecosystemId: number;
  userId: string;
  questionId: number | null;
  subjectId: number | null;
  subjectName: string;
  topic: string;
  correct: boolean;
  source: string;
  selectedAnswer?: string;
  durationSec?: number;
  confidence?: number | null;
  errorType?: MistakeErrorType;
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
  reference: Array<{ id: number; correctAnswer: string; correctAnswers?: unknown }>,
): { correct: number; total: number } {
  if (!Array.isArray(answers)) {
    throw new AppError(400, "answers must be an array.", "VALIDATION_ERROR");
  }
  // The runtime payload may contain malformed entries; validate defensively.
  const raw = answers as Array<Partial<SubmittedAnswer> | null>;
  const byId = new Map(reference.map((q) => [q.id, q]));
  let correct = 0;
  for (const a of raw) {
    if (!a || !Number.isInteger(a.questionId) || (typeof a.selected !== "string" && !Array.isArray(a.selected))) {
      throw new AppError(400, "Each answer needs a numeric questionId and a selected string.", "VALIDATION_ERROR");
    }
    const ref = byId.get(a.questionId as number);
    if (ref === undefined) {
      throw new AppError(400, `Unknown questionId ${a.questionId}.`, "VALIDATION_ERROR");
    }
    if (isSelectionCorrect(toSelectedArray(a.selected), ref)) correct += 1;
  }
  return { correct, total: answers.length };
}

/** Normalize a legacy string pick or multi-pick set to a trimmed array. */
export function toSelectedArray(selected: string | string[] | unknown): string[] {
  const arr = Array.isArray(selected) ? selected : [selected];
  return [...new Set(arr.filter((s): s is string => typeof s === "string").map((s) => s.trim()))].filter((s) => s.length > 0);
}

/** Authoritative correct set: correctAnswers iff non-empty, else [correctAnswer]. */
function getCorrectSet(ref: { correctAnswer: string; correctAnswers?: unknown }): string[] {
  const arr = Array.isArray(ref.correctAnswers)
    ? ref.correctAnswers.filter((s): s is string => typeof s === "string")
    : [];
  const set = arr.length > 0 ? arr : [ref.correctAnswer];
  return [...new Set(set.map((s) => s.trim()))].filter((s) => s.length > 0);
}

/** All-or-nothing set equality (mirrors frontend isAnswerCorrect). */
function isSelectionCorrect(
  selected: string[],
  ref: { correctAnswer: string; correctAnswers?: unknown },
): boolean {
  const correct = getCorrectSet(ref);
  return selected.length === correct.length && selected.every((s) => correct.includes(s));
}

/** Serialize for the QuestionAttempt.selectedAnswer string column. */
function serializeSelected(selected: string | string[]): string {
  return toSelectedArray(selected).join(" ‖ ");
}

// ── Practice (Question table) ─────────────────────────────
export async function submitPracticeAnswers(
  userId: string,
  answers: SubmittedAnswer[],
  ecosystemCode?: string | null,
): Promise<SubmissionSummary> {
  try {
    // Unanswered questions are sent as "" (or []) — skip them so they are
    // neither scored as wrong nor recorded as an attempt (deflating accuracy
    // / polluting weak-topic analytics). Mirrors the exam engine's behavior.
    const answered = answers.filter((a) => toSelectedArray(a.selected).length > 0);
    const ids = answered.map((a) => a.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        subjectId: true,
        ecosystemId: true,
        topicId: true,
        topic: true,
        correctAnswer: true,
        correctAnswers: true,
        difficulty: true,
        subject: { select: { nameBn: true } },
        ecosystem: { select: { code: true } },
      },
    });
    // Previous per-question progress (READ BEFORE the transaction writes) — the
    // classifier must see the state prior to this submission, not after.
    const priorProgress = (await prisma.userQuestionProgress.findMany({
      where: { userId, questionId: { in: ids } },
      select: {
        questionId: true,
        masteryStatus: true,
        consecutiveIncorrect: true,
        mistakeCount: true,
        totalAttempts: true,
      },
    })) ?? [];
    const priorById = new Map(priorProgress.map((p) => [p.questionId, p]));
    const { correct, total } = gradeAnswers(answered, questions);
    const byId = new Map(questions.map((q) => [q.id, q]));
    // Negative marking per ecosystem: Bank −0.25 / wrong, BCS −0.50 / wrong.
    // Prefer the explicit client ecosystem; fall back to the questions' own
    // ecosystem codes so mixed/unknown sessions use the BCS rule.
    const codeFromQuestions =
      questions.length > 0 && questions.every((q) => q.ecosystem?.code === "BANGLADESH_BANK")
        ? "BANGLADESH_BANK"
        : "BCS";
    const penaltyPerWrong = (ecosystemCode ?? codeFromQuestions) === "BANGLADESH_BANK" ? 0.25 : 0.5;
    const wrong = answered.length - correct;
    const negativeMarks = Math.round(wrong * penaltyPerWrong * 100) / 100;
    const finalScore = Math.round((correct - wrong * penaltyPerWrong) * 100) / 100;

    const attempts: AttemptRow[] = answered.map((a) => {
      const q = byId.get(a.questionId);
      const isCorrect = q ? isSelectionCorrect(toSelectedArray(a.selected), q) : false;
      const errorType = classifyErrorType({
        isCorrect,
        difficulty: q?.difficulty ?? null,
        durationSec: a.durationSec,
        previous: priorById.get(a.questionId),
      });
      return {
        ecosystemId: q?.ecosystemId ?? 1,
        userId,
        questionId: a.questionId,
        subjectId: q?.subjectId ?? null,
        subjectName: q?.subject ? q.subject.nameBn : "",
        topic: q?.topic ?? "",
        correct: isCorrect,
        source: "practice",
        selectedAnswer: serializeSelected(a.selected),
        durationSec: toDurationSec(a.durationSec),
        confidence: toConfidence(a.confidence),
        errorType: errorType ?? undefined,
      };
    });
    const attemptFacts: AttemptFact[] = answered.map((a) => {
      const q = byId.get(a.questionId);
      return {
        questionId: a.questionId,
        correct: q ? isSelectionCorrect(toSelectedArray(a.selected), q) : false,
        answered: true,
        subjectId: q?.subjectId ?? null,
        topicId: q?.topicId ?? null,
      };
    });

    const pointsEarned = correct * POINTS_PER_CORRECT;
    const feedback: NonNullable<SubmissionSummary["feedback"]> = {};
    await prisma.$transaction(async (tx) => {
      await recordAttemptsAtomically(tx, userId, attempts, pointsEarned);
      // Record per-question mastery progress for mistake tracking.
      for (const a of answered) {
        const q = byId.get(a.questionId);
        const isCorrect = q ? isSelectionCorrect(toSelectedArray(a.selected), q) : false;
        const fb = await recordQuestionAttempt(tx, {
          userId,
          questionId: a.questionId,
          isCorrect,
          subject: q?.subject?.nameBn,
          topic: q?.topic,
        });
        if (fb && fb.masteryStatus) {
          feedback[a.questionId] = {
            masteryStatus: fb.masteryStatus,
            isMistake: fb.isMistake,
            justMastered: fb.justMastered,
          };
        }
      }
    });
    // Domain event (Phase 11) — emitted only after the transaction committed.
    emit({
      name: "PRACTICE_SUBMITTED",
      userId,
      correct,
      total,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
      attempts: attemptFacts,
    });
    return { correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0, pointsEarned, feedback, wrong, negativeMarks, finalScore, penaltyPerWrong };
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

    // Daily quiz is single-pick only (multi-pick lives in practice).
    const single = answers.map((a) => {
      if (!a || !Number.isInteger(a.questionId) || typeof a.selected !== "string") {
        throw new AppError(400, "Each answer needs a numeric questionId and a selected string.", "VALIDATION_ERROR");
      }
      return { ...a, selected: a.selected };
    });
    // Unanswered questions are sent as "" — skip them (same rationale as
    // practice) so they are not recorded as wrong attempts.
    const answered = single.filter((a) => a.selected.trim().length > 0);
    const { correct, total } = gradeAnswers(answered, quiz.questions);
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const pointsEarned = correct * POINTS_PER_CORRECT;

    // Previous per-question progress (QuizQuestion ids are the progress key) —
    // read before the transaction so classification sees prior state.
    const priorProgress = (await prisma.userQuestionProgress.findMany({
      where: { userId, questionId: { in: answered.map((a) => a.questionId) } },
      select: {
        questionId: true,
        masteryStatus: true,
        consecutiveIncorrect: true,
        mistakeCount: true,
        totalAttempts: true,
      },
    })) ?? [];
    const priorById = new Map(priorProgress.map((p) => [p.questionId, p]));

    const attempts: AttemptRow[] = answered.map((a) => {
      const q = byId.get(a.questionId);
      const isCorrect = a.selected.trim() === q?.correctAnswer.trim();
      const errorType = classifyErrorType({
        isCorrect,
        difficulty: null,
        durationSec: a.durationSec,
        previous: priorById.get(a.questionId),
      });
      return {
        ecosystemId: quiz.ecosystemId,
        userId,
        questionId: null,
        subjectId: null,
        subjectName: q?.subject ?? "",
        topic: q?.topic ?? "",
        correct: isCorrect,
        source: "daily",
        selectedAnswer: a.selected,
        durationSec: toDurationSec(a.durationSec),
        confidence: toConfidence(a.confidence),
        errorType: errorType ?? undefined,
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
      // Record per-question mastery progress for mistake tracking.
      for (const a of answered) {
        const q = byId.get(a.questionId);
        const isCorrect = a.selected.trim() === q?.correctAnswer.trim();
        await recordQuestionAttempt(tx, {
          userId,
          questionId: a.questionId,
          isCorrect,
          subject: q?.subject,
          topic: q?.topic,
        });
      }
    });

    emit({
      name: "DAILY_QUIZ_COMPLETED",
      userId,
      quizId,
      score,
      attempts: answered.map((a) => {
        const q = byId.get(a.questionId);
        return {
          questionId: a.questionId,
          correct: a.selected.trim() === q?.correctAnswer.trim(),
          answered: true,
        };
      }),
    });
    return { correct, total, score, pointsEarned };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record daily quiz");
  }
}

export type DailyQuizHistoryItem = {
  quizId: number;
  date: string;
  score: number;
  correct: number;
  total: number;
  completedAt: string;
};

/**
 * Recent daily-quiz participations for the user (most-recent first). Backs the
 * "completed today" state and the history strip in the daily-quiz widget.
 */
export async function getDailyQuizHistory(
  userId: string,
  limit = 14,
): Promise<DailyQuizHistoryItem[]> {
  try {
    const rows = await prisma.dailyQuizParticipation.findMany({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: limit,
      select: {
        quizId: true,
        score: true,
        correct: true,
        total: true,
        completedAt: true,
        dailyQuiz: { select: { date: true } },
      },
    });
    return rows.map((r) => ({
      quizId: r.quizId,
      date: r.dailyQuiz?.date ? String(r.dailyQuiz.date) : "",
      score: r.score,
      correct: r.correct,
      total: r.total,
      completedAt: r.completedAt?.toISOString() ?? "",
    }));
  } catch {
    throw new InternalServerError("Failed to fetch daily-quiz history");
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
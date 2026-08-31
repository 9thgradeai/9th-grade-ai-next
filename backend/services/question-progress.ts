// backend/services/question-progress.ts — centralized question attempt recording.
// Every answer submission (practice, exam, daily quiz) must funnel through
// recordQuestionAttempt() to update the per-user per-question mastery state.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import {
  upsertProgress,
  getMistakesBySubject,
  getMistakeStats,
  getMistakes,
  getMistakeQuestionIds,
  getCrossSubjectMistakeIds,
  getOverallStats,
  getMistakeSelectionTree,
  getMistakeQuestionIdsBySelection,
  type MistakeFilters,
} from "~backend/repositories/question-progress.repository";
import {
  computeMasteryStatus,
  computeMasteryScore,
  isStillAMistake,
  computeReviewInterval,
  computeMistakePriorityScore,
  type MasteryStatus,
} from "./mastery";

export type RecordAttemptInput = {
  userId: string;
  questionId: number;
  isCorrect: boolean;
  subject?: string;
  topic?: string;
  exam?: string;
};

/**
 * Record a single question attempt and update the user's mastery progress
 * atomically. This is THE centralized write path for all question answering.
 *
 * Called inside an existing transaction from the practice/exam/daily-quiz
 * submission services. The transaction client MUST be passed in.
 */
export type AttemptFeedback = {
  /** Resulting mastery status after this attempt (null when recording failed). */
  masteryStatus: MasteryStatus | null;
  /** True while the question still needs practice. */
  isMistake: boolean;
  /** Set when THIS attempt just promoted the question to MASTERED. */
  justMastered: boolean;
};

export type RecordAttemptResult = AttemptFeedback | null;

export async function recordQuestionAttempt(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  input: RecordAttemptInput,
): Promise<RecordAttemptResult> {
  try {
    const { userId, questionId, isCorrect, subject, topic, exam } = input;
    const now = new Date();

    // Read current progress (inside the same transaction for consistency).
    const existing = await tx.userQuestionProgress.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });

    if (!existing) {
      // First attempt ever — create the progress row.
      const newStatus: MasteryStatus = isCorrect ? "NEW" : "STRUGGLING";
      const newScore = computeMasteryScore(0, isCorrect);
      const isMistake = !isCorrect;

      await upsertProgress(tx, userId, questionId, {
        totalAttempts: 1,
        correctAttempts: isCorrect ? 1 : 0,
        incorrectAttempts: isCorrect ? 0 : 1,
        consecutiveCorrect: isCorrect ? 1 : 0,
        consecutiveIncorrect: isCorrect ? 0 : 1,
        mistakeCount: isCorrect ? 0 : 1,
        masteryScore: newScore,
        masteryStatus: newStatus,
        isMistake,
        firstIncorrectAt: isCorrect ? null : now,
        lastIncorrectAt: isCorrect ? null : now,
        lastCorrectAt: isCorrect ? now : null,
        lastSubject: subject ?? "",
        lastTopic: topic ?? "",
        lastExam: exam ?? "",
      });
      return { masteryStatus: newStatus, isMistake, justMastered: false };
    }

    // Update existing progress row.
    const totalAttempts = existing.totalAttempts + 1;
    const correctAttempts = existing.correctAttempts + (isCorrect ? 1 : 0);
    const incorrectAttempts = existing.incorrectAttempts + (isCorrect ? 0 : 1);
    const consecutiveCorrect = isCorrect ? existing.consecutiveCorrect + 1 : 0;
    const consecutiveIncorrect = isCorrect ? 0 : existing.consecutiveIncorrect + 1;
    const mistakeCount = existing.mistakeCount + (isCorrect ? 0 : 1);
    const masteryScore = computeMasteryScore(existing.masteryScore, isCorrect);
    const masteryStatus = computeMasteryStatus(
      existing.masteryStatus,
      isCorrect,
      consecutiveCorrect,
    );
    const isMistake = isStillAMistake(masteryStatus, incorrectAttempts);
    const justMastered = masteryStatus === "MASTERED" && existing.masteryStatus !== "MASTERED";

    // Review scheduling
    const reviewCount = existing.reviewCount + (isCorrect && existing.isMistake ? 1 : 0);
    const nextReviewAt = isMistake
      ? new Date(now.getTime() + computeReviewInterval(mistakeCount, masteryStatus) * 60 * 60 * 1000)
      : null;

    await upsertProgress(tx, userId, questionId, {
      totalAttempts,
      correctAttempts,
      incorrectAttempts,
      consecutiveCorrect,
      consecutiveIncorrect,
      mistakeCount,
      masteryScore,
      masteryStatus,
      masteredAt: justMastered ? now : existing.masteredAt,
      isMistake,
      firstIncorrectAt: existing.firstIncorrectAt ?? (isCorrect ? null : now),
      lastIncorrectAt: isCorrect ? existing.lastIncorrectAt : now,
      lastCorrectAt: isCorrect ? now : existing.lastCorrectAt,
      reviewCount,
      lastReviewedAt: isCorrect && existing.isMistake ? now : existing.lastReviewedAt,
      nextReviewAt,
      lastSubject: subject ?? existing.lastSubject,
      lastTopic: topic ?? existing.lastTopic,
      lastExam: exam ?? existing.lastExam,
    });

    return { masteryStatus, isMistake, justMastered };
  } catch (error) {
    // Never break the submission flow — log and swallow.
    console.error("[question-progress] Failed to record attempt:", error);
    return null;
  }
}

// ── Read API (delegates to repository) ─────────────────────

export type { MistakeFilters };

export async function getMistakesForUser(
  userId: string,
  filters: MistakeFilters,
  page: number,
  limit: number,
) {
  try {
    return await getMistakes(userId, filters, page, limit);
  } catch {
    throw new InternalServerError("Failed to fetch mistakes");
  }
}

export async function getMistakesBySubjectForUser(userId: string) {
  try {
    return await getMistakesBySubject(userId);
  } catch {
    throw new InternalServerError("Failed to fetch subject mistake counts");
  }
}

export async function getMistakeStatsForUser(userId: string) {
  try {
    return await getMistakeStats(userId);
  } catch {
    throw new InternalServerError("Failed to fetch mistake statistics");
  }
}

export async function getOverallStatsForUser(userId: string) {
  try {
    return await getOverallStats(userId);
  } catch {
    throw new InternalServerError("Failed to fetch accuracy statistics");
  }
}

export async function getMistakeSelectionTreeForUser(userId: string) {
  try {
    return await getMistakeSelectionTree(userId);
  } catch {
    throw new InternalServerError("Failed to fetch mistake selection tree");
  }
}

export async function getMistakeQuestionIdsBySelectionForUser(
  userId: string,
  filters: { subject?: string; topic?: string; subtopic?: string; difficulty?: string },
  limit: number,
  focus?: string,
) {
  try {
    return await getMistakeQuestionIdsBySelection(userId, filters, limit, focus);
  } catch {
    throw new InternalServerError("Failed to fetch mistake question IDs");
  }
}

export async function getMistakeQuestionIdsForUser(
  userId: string,
  opts: { subject?: string; difficulty?: string; limit: number; focus?: string },
) {
  try {
    return await getMistakeQuestionIds(userId, opts);
  } catch {
    throw new InternalServerError("Failed to fetch mistake question IDs");
  }
}

export async function getCrossSubjectMistakeIdsForUser(userId: string, count: number) {
  try {
    return await getCrossSubjectMistakeIds(userId, count);
  } catch {
    throw new InternalServerError("Failed to fetch cross-subject mistake IDs");
  }
}

/**
 * Build priority scores for a set of mistake question IDs.
 * Used by the mistake exam builder to select the best questions.
 */
export function scoreMistakeQuestions(
  rows: Awaited<ReturnType<typeof getMistakeQuestionIds>>,
): { questionId: number; score: number }[] {
  const now = new Date();
  return rows
    .map((r) => ({
      questionId: r.questionId,
      score: computeMistakePriorityScore({
        mistakeCount: r.mistakeCount,
        lastIncorrectAt: r.lastIncorrectAt,
        masteryScore: r.masteryScore,
        nextReviewAt: r.nextReviewAt,
        difficulty: r.difficulty as "EASY" | "MEDIUM" | "HARD",
        totalAttempts: r.totalAttempts,
        now,
      }),
    }))
    .sort((a, b) => b.score - a.score);
}

// backend/services/question-progress.ts — centralized question attempt recording.
// Every answer submission (practice, exam, daily quiz) must funnel through
// recordQuestionAttempt() to update the per-user per-question mastery state.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import { log } from "~backend/infrastructure/observability/logger";
import type { UserQuestionProgress } from "@prisma/client";
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

type TxnClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type ProgressTransition = {
  fields: Record<string, string | number | boolean | Date | null>;
  feedback: AttemptFeedback;
};

/**
 * Pure transition: existing row (or null) + attempt → upsert fields + feedback.
 * Shared by the single and batch write paths so the two can never drift apart.
 */
function computeNextProgress(
  existing: UserQuestionProgress | null,
  input: RecordAttemptInput,
  now: Date,
): ProgressTransition {
  const { isCorrect, subject, topic, exam } = input;

  if (!existing) {
    // First attempt ever — create the progress row.
    const newStatus: MasteryStatus = isCorrect ? "NEW" : "STRUGGLING";
    const newScore = computeMasteryScore(0, isCorrect);
    const isMistake = !isCorrect;

    return {
      fields: {
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
      },
      feedback: { masteryStatus: newStatus, isMistake, justMastered: false },
    };
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

  return {
    fields: {
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
    },
    feedback: { masteryStatus, isMistake, justMastered },
  };
}

async function applyProgress(
  tx: TxnClient,
  userId: string,
  questionId: number,
  existing: UserQuestionProgress | null,
  input: RecordAttemptInput,
  now: Date,
): Promise<{ feedback: AttemptFeedback; updated: UserQuestionProgress }> {
  const { fields, feedback } = computeNextProgress(existing, input, now);
  const updated = await upsertProgress(tx, userId, questionId, fields);
  return { feedback, updated };
}

export async function recordQuestionAttempt(
  tx: TxnClient,
  input: RecordAttemptInput,
): Promise<RecordAttemptResult> {
  try {
    const { userId, questionId } = input;

    // Read current progress (inside the same transaction for consistency).
    const existing = await tx.userQuestionProgress.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });

    const { feedback } = await applyProgress(tx, userId, questionId, existing, input, new Date());
    return feedback;
  } catch (error) {
    // Fail-open by contract (practice must never hard-fail on a progress
    // write) — but observable: structured log, never a bare console.error.
    log.error("question-progress.record-failed", { userId: input.userId, questionId: input.questionId, error: String(error) });
    return null;
  }
}

/**
 * Batch mastery write: ONE bulk read + one upsert per question (was: a
 * read + write per question). Same pure transition, same per-question
 * error isolation (a single bad row yields null feedback, never aborts the
 * batch), same fail-open contract as the singular path.
 *
 * In-batch chaining: a repeated questionId in one batch builds on the row
 * written earlier in the same loop, mirroring sequential read-modify-write.
 * If the bulk read itself fails, falls back to per-question reads.
 */
export async function recordQuestionAttempts(
  tx: TxnClient,
  inputs: RecordAttemptInput[],
): Promise<Map<number, RecordAttemptResult>> {
  const out = new Map<number, RecordAttemptResult>();
  if (inputs.length === 0) return out;
  const now = new Date();
  const userId = inputs[0].userId;

  let preloaded: Map<number, UserQuestionProgress>;
  try {
    const ids = [...new Set(inputs.map((i) => i.questionId))];
    const rows = await tx.userQuestionProgress.findMany({
      where: { userId, questionId: { in: ids } },
    });
    preloaded = new Map(rows.map((r) => [r.questionId, r]));
  } catch (error) {
    log.error("question-progress.bulk-read-failed", { userId, count: inputs.length, error: String(error) });
    for (const input of inputs) {
      out.set(input.questionId, await recordQuestionAttempt(tx, input));
    }
    return out;
  }

  const chained = new Map<number, UserQuestionProgress>();
  for (const input of inputs) {
    try {
      const base = chained.get(input.questionId) ?? preloaded.get(input.questionId) ?? null;
      const { feedback, updated } = await applyProgress(
        tx,
        input.userId,
        input.questionId,
        base,
        input,
        now,
      );
      chained.set(input.questionId, updated);
      out.set(input.questionId, feedback);
    } catch (error) {
      log.error("question-progress.record-failed", { userId: input.userId, questionId: input.questionId, error: String(error) });
      out.set(input.questionId, null);
    }
  }
  return out;
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

// ── Selection tree builder ──────────────────────────────────────

type FlatTreeRow = { subject: string; topic: string; subtopic: string | null; count: number };

export type MistakeSelectionTree = {
  subject: string;
  count: number;
  topics: {
    topic: string;
    count: number;
    subtopics: { subtopic: string; count: number }[];
  }[];
}[];

/** Build a subject → topic → subtopic tree from flat rows, sorted by count descending. */
export function buildMistakeSelectionTree(flat: FlatTreeRow[]): MistakeSelectionTree {
  const subjectMap = new Map<
    string,
    { subject: string; count: number; topics: Map<string, { topic: string; count: number; subtopics: Map<string, number> }> }
  >();
  for (const row of flat) {
    let subj = subjectMap.get(row.subject);
    if (!subj) {
      subj = { subject: row.subject, count: 0, topics: new Map() };
      subjectMap.set(row.subject, subj);
    }
    subj.count += row.count;

    let topic = subj.topics.get(row.topic);
    if (!topic) {
      topic = { topic: row.topic, count: 0, subtopics: new Map() };
      subj.topics.set(row.topic, topic);
    }
    topic.count += row.count;
    if (row.subtopic) {
      topic.subtopics.set(row.subtopic, (topic.subtopics.get(row.subtopic) ?? 0) + row.count);
    }
  }

  return [...subjectMap.values()]
    .sort((a, b) => b.count - a.count)
    .map((s) => ({
      subject: s.subject,
      count: s.count,
      topics: [...s.topics.values()]
        .sort((a, b) => b.count - a.count)
        .map((t) => ({
          topic: t.topic,
          count: t.count,
          subtopics: [...t.subtopics.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([subtopic, count]) => ({ subtopic, count })),
        })),
    }));
}

// ── Mistake list DTO mapper ─────────────────────────────────────

type MistakeRowInput = {
  id: string | number;
  questionId: number;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  consecutiveCorrect: number;
  mistakeCount: number;
  masteryScore: number;
  masteryStatus: string;
  isMistake: boolean;
  firstIncorrectAt: Date | null;
  lastIncorrectAt: Date | null;
  lastCorrectAt: Date | null;
  lastReviewedAt: Date | null;
  reviewCount: number;
  lastSubject: string | null;
  lastTopic: string | null;
  question: unknown;
};

export type MistakeListItem = {
  id: string;
  questionId: number;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  consecutiveCorrect: number;
  mistakeCount: number;
  masteryScore: number;
  masteryStatus: string;
  isMistake: boolean;
  firstIncorrectAt: string | null;
  lastIncorrectAt: string | null;
  lastCorrectAt: string | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  lastSubject: string | null;
  lastTopic: string | null;
  question: {
    id: number;
    subjectId: number;
    subject: string;
    topic: string | null;
    subtopic: string | null;
    question: string;
    options: unknown;
    correctAnswer: string;
    explanation: string | null;
    difficulty: string;
    year: number | null;
    sourceExam: string | null;
    bcsTerm: null;
    latestErrorType: string | null;
  };
};

/** Transform raw mistake rows into the flat DTO expected by the client. */
export function flattenMistakesForClient(rows: MistakeRowInput[]): MistakeListItem[] {
  return rows.map((row) => {
    const q = row.question as Record<string, unknown>;
    const subjectObj = q.subject as Record<string, unknown> | undefined;
    const attempts = q.attempts as Array<{ errorType?: string | null }> | undefined;
    return {
      id: String(row.id),
      questionId: row.questionId,
      totalAttempts: row.totalAttempts,
      correctAttempts: row.correctAttempts,
      incorrectAttempts: row.incorrectAttempts,
      consecutiveCorrect: row.consecutiveCorrect,
      mistakeCount: row.mistakeCount,
      masteryScore: row.masteryScore,
      masteryStatus: row.masteryStatus,
      isMistake: row.isMistake,
      firstIncorrectAt: row.firstIncorrectAt?.toISOString() ?? null,
      lastIncorrectAt: row.lastIncorrectAt?.toISOString() ?? null,
      lastCorrectAt: row.lastCorrectAt?.toISOString() ?? null,
      lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      reviewCount: row.reviewCount,
      lastSubject: row.lastSubject,
      lastTopic: row.lastTopic,
      question: {
        id: q.id as number,
        subjectId: q.subjectId as number,
        subject: (subjectObj?.nameBn as string) ?? "",
        topic: q.topic as string | null,
        subtopic: q.subtopic as string | null,
        question: q.question as string,
        options: q.options,
        correctAnswer: (q.correctAnswer as string) ?? "",
        explanation: (q.explanation as string | null) ?? null,
        difficulty: (q.difficulty as string) ?? "",
        year: (q.year as number | null) ?? null,
        sourceExam: (q.sourceExam as string | null) ?? null,
        bcsTerm: null,
        latestErrorType: attempts?.[0]?.errorType ?? null,
      },
    };
  });
}

// backend/repositories/question-progress.repository.ts
// Data access for UserQuestionProgress. Repositories are the ONLY place (besides
// db.ts) allowed to call Prisma — route handlers and services must go through
// this layer. Raw SQL is parameterized via Prisma's tagged-template; string
// concatenation is forbidden.

import "server-only";

import { prisma } from "~backend/db";
import type { Prisma } from "@prisma/client";

type MasteryStatus = "NEW" | "STRUGGLING" | "REVIEWING" | "IMPROVING" | "MASTERED";

// ── Upsert helpers (used inside transactions) ──────────────

/** Plain-field payload for progress upserts (no relation wrappers). */
export type ProgressFields = Record<string, string | number | boolean | Date | null>;

/**
 * Upsert a UserQuestionProgress row inside a transaction. Returns the
 * upserted row so the caller can read updated counters.
 */
export async function upsertProgress(
  tx: Prisma.TransactionClient,
  userId: string,
  questionId: number,
  data: ProgressFields,
) {
  return tx.userQuestionProgress.upsert({
    where: { userId_questionId: { userId, questionId } },
    update: data,
    create: {
      userId,
      questionId,
      ...data,
    },
  });
}

// ── Read queries ───────────────────────────────────────────

/**
 * Fetch a single progress row for a user+question pair.
 */
export async function getProgress(userId: string, questionId: number) {
  return prisma.userQuestionProgress.findUnique({
    where: { userId_questionId: { userId, questionId } },
  });
}

export type MistakeFilters = {
  subject?: string;
  status?: MasteryStatus;
  difficulty?: string;
  topic?: string;
  exam?: string;
  sort?: string;
};

export type MistakeRow = {
  id: number;
  userId: string;
  questionId: number;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  consecutiveCorrect: number;
  consecutiveIncorrect: number;
  mistakeCount: number;
  masteryScore: number;
  masteryStatus: MasteryStatus;
  masteredAt: Date | null;
  isMistake: boolean;
  firstIncorrectAt: Date | null;
  lastIncorrectAt: Date | null;
  lastCorrectAt: Date | null;
  reviewCount: number;
  lastReviewedAt: Date | null;
  nextReviewAt: Date | null;
  lastSubject: string;
  lastTopic: string;
  lastExam: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Paginated mistake list for a user with optional filters.
 * Returns progress rows joined with question metadata.
 */
export async function getMistakes(
  userId: string,
  filters: MistakeFilters,
  page: number,
  limit: number,
): Promise<{ data: (MistakeRow & { question: Record<string, unknown> })[]; total: number }> {
  const where: Prisma.UserQuestionProgressWhereInput = {
    userId,
    isMistake: true,
  };

  if (filters.subject) {
    where.lastSubject = filters.subject;
  }
  if (filters.status) {
    where.masteryStatus = filters.status;
  }
  if (filters.difficulty) {
    where.question = { difficulty: filters.difficulty as "EASY" | "MEDIUM" | "HARD" };
  }
  if (filters.topic) {
    where.lastTopic = { contains: filters.topic, mode: "insensitive" };
  }

  const orderBy: Prisma.UserQuestionProgressOrderByWithRelationInput =
    filters.sort === "recently_wrong"
      ? { lastIncorrectAt: "desc" }
      : filters.sort === "least_mastered"
        ? { masteryScore: "asc" }
        : filters.sort === "highest_difficulty"
          ? { question: { difficulty: "desc" } }
          : filters.sort === "oldest"
            ? { firstIncorrectAt: "asc" }
            : filters.sort === "recently_reviewed"
              ? { lastReviewedAt: "desc" }
              : { mistakeCount: "desc" }; // default: most frequently wrong

  const [data, total] = await Promise.all([
    prisma.userQuestionProgress.findMany({
      where,
      include: {
        question: {
          select: {
            id: true,
            subjectId: true,
            topic: true,
            subtopic: true,
            question: true,
            options: true,
            correctAnswer: true,
            explanation: true,
            difficulty: true,
            year: true,
            sourceExam: true,
            subject: { select: { nameBn: true } },
          },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.userQuestionProgress.count({ where }),
  ]);

  return { data, total };
}

export type SubjectMistakeCount = {
  subject: string;
  count: number;
  unmastered: number;
};

/**
 * Aggregate mistake counts per subject for a user.
 */
export async function getMistakesBySubject(userId: string): Promise<SubjectMistakeCount[]> {
  const rows = await prisma.$queryRaw<
    { subject: string; count: number; unmastered: number }[]
  >`
    SELECT "lastSubject" AS "subject",
           COUNT(*)::int AS "count",
           COUNT(*) FILTER (WHERE "masteryStatus" != 'MASTERED')::int AS "unmastered"
    FROM "UserQuestionProgress"
    WHERE "userId" = ${userId} AND "isMistake" = true
    GROUP BY "lastSubject"
    ORDER BY "count" DESC
  `;

  return rows.map((r) => ({
    subject: r.subject || "অন্যান্য",
    count: Number(r.count),
    unmastered: Number(r.unmastered),
  }));
}

export type MistakeStats = {
  totalMistakes: number;
  unmastered: number;
  struggling: number;
  reviewing: number;
  improving: number;
  mastered: number;
  accuracy: number;
  totalAttempts: number;
  totalCorrect: number;
};

export type OverallStats = {
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracy: number;
  questionsAttempted: number;
};

/**
 * Overall answer-history statistics for a user (across every question flow).
 * Sourced from the accumulated UserQuestionProgress counters, which are updated
 * by recordQuestionAttempt for every answered question (practice, exam,
 * daily quiz, etc.). WHERE has no isMistake filter, so this reflects ALL
 * attempts — not just the mistake pool.
 */
export async function getOverallStats(userId: string): Promise<OverallStats> {
  const rows = await prisma.$queryRaw<
    {
      totalAttempts: number;
      totalCorrect: number;
      totalWrong: number;
      questionsAttempted: number;
    }[]
  >`
    SELECT
      COALESCE(SUM("totalAttempts"), 0)::int AS "totalAttempts",
      COALESCE(SUM("correctAttempts"), 0)::int AS "totalCorrect",
      COALESCE(SUM("incorrectAttempts"), 0)::int AS "totalWrong",
      COUNT(*)::int AS "questionsAttempted"
    FROM "UserQuestionProgress"
    WHERE "userId" = ${userId}
  `;

  const r = rows[0];
  const totalAttempts = Number(r?.totalAttempts ?? 0);
  const totalCorrect = Number(r?.totalCorrect ?? 0);
  const totalWrong = Number(r?.totalWrong ?? 0);
  return {
    totalAttempts,
    totalCorrect,
    totalWrong,
    accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    questionsAttempted: Number(r?.questionsAttempted ?? 0),
  };
}

/**
 * Aggregate mistake statistics for a user.
 */
export async function getMistakeStats(userId: string): Promise<MistakeStats> {
  const rows = await prisma.$queryRaw<
    {
      totalMistakes: number;
      unmastered: number;
      struggling: number;
      reviewing: number;
      improving: number;
      mastered: number;
      totalAttempts: number;
      totalCorrect: number;
    }[]
  >`
    SELECT
      COUNT(*) FILTER (WHERE "isMistake" = true)::int AS "totalMistakes",
      COUNT(*) FILTER (WHERE "isMistake" = true AND "masteryStatus" != 'MASTERED')::int AS "unmastered",
      COUNT(*) FILTER (WHERE "isMistake" = true AND "masteryStatus" = 'STRUGGLING')::int AS "struggling",
      COUNT(*) FILTER (WHERE "isMistake" = true AND "masteryStatus" = 'REVIEWING')::int AS "reviewing",
      COUNT(*) FILTER (WHERE "isMistake" = true AND "masteryStatus" = 'IMPROVING')::int AS "improving",
      COUNT(*) FILTER (WHERE "isMistake" = true AND "masteryStatus" = 'MASTERED')::int AS "mastered",
      COALESCE(SUM("totalAttempts"), 0)::int AS "totalAttempts",
      COALESCE(SUM("correctAttempts"), 0)::int AS "totalCorrect"
    FROM "UserQuestionProgress"
    WHERE "userId" = ${userId}
  `;

  const r = rows[0];
  const totalAttempts = Number(r?.totalAttempts ?? 0);
  const totalCorrect = Number(r?.totalCorrect ?? 0);
  return {
    totalMistakes: Number(r?.totalMistakes ?? 0),
    unmastered: Number(r?.unmastered ?? 0),
    struggling: Number(r?.struggling ?? 0),
    reviewing: Number(r?.reviewing ?? 0),
    improving: Number(r?.improving ?? 0),
    mastered: Number(r?.mastered ?? 0),
    accuracy: totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0,
    totalAttempts,
    totalCorrect,
  };
}

/**
 * Get question IDs for mistake exam selection, prioritized by the scoring
 * algorithm. Used by the mistake exam builder.
 */
export async function getMistakeQuestionIds(
  userId: string,
  opts: {
    subject?: string;
    difficulty?: string;
    limit: number;
    focus?: string;
  },
): Promise<
  {
    questionId: number;
    mistakeCount: number;
    masteryScore: number;
    lastIncorrectAt: Date | null;
    nextReviewAt: Date | null;
    difficulty: string;
    totalAttempts: number;
  }[]
> {
  const where: Prisma.UserQuestionProgressWhereInput = {
    userId,
    isMistake: true,
    masteryStatus: { not: "MASTERED" },
  };

  if (opts.subject) {
    where.lastSubject = opts.subject;
  }
  if (opts.difficulty) {
    where.question = { difficulty: opts.difficulty as "EASY" | "MEDIUM" | "HARD" };
  }

  // For "due_for_review" focus, prioritize by nextReviewAt
  const orderBy: Prisma.UserQuestionProgressOrderByWithRelationInput =
    opts.focus === "due_for_review"
      ? { nextReviewAt: "asc" }
      : opts.focus === "most_wrong"
        ? { mistakeCount: "desc" }
        : opts.focus === "recently_wrong"
          ? { lastIncorrectAt: "desc" }
          : opts.focus === "weakest_topics"
            ? { masteryScore: "asc" }
            : { masteryScore: "asc", mistakeCount: "desc" }; // random = lowest mastery first

  // Fetch more than needed for scoring, then trim in-memory
  const fetchLimit = Math.min(opts.limit * 3, 500);

  const rows = await prisma.userQuestionProgress.findMany({
    where,
    select: {
      questionId: true,
      mistakeCount: true,
      masteryScore: true,
      lastIncorrectAt: true,
      nextReviewAt: true,
      totalAttempts: true,
      question: { select: { difficulty: true } },
    },
    orderBy,
    take: fetchLimit,
  });

  return rows.map((r) => ({
    questionId: r.questionId,
    mistakeCount: r.mistakeCount,
    masteryScore: r.masteryScore,
    lastIncorrectAt: r.lastIncorrectAt,
    nextReviewAt: r.nextReviewAt,
    difficulty: r.question.difficulty,
    totalAttempts: r.totalAttempts,
  }));
}

/**
 * Get question IDs for cross-subject mistake exam, distributed across subjects.
 */
export async function getCrossSubjectMistakeIds(
  userId: string,
  totalCount: number,
): Promise<number[]> {
  const subjects = await getMistakesBySubject(userId);
  if (subjects.length === 0) return [];

  // Import here to avoid circular dependency (pure function, no DB).
  const { allocateMistakesAcrossSubjects } = await import("~backend/services/mastery");
  const allocations = allocateMistakesAcrossSubjects(
    totalCount,
    subjects.filter((s) => s.unmastered > 0).map((s) => ({ subject: s.subject, count: s.unmastered })),
  );

  const allIds: number[] = [];
  for (const alloc of allocations) {
    if (alloc.allocated <= 0) continue;
    const rows = await prisma.userQuestionProgress.findMany({
      where: {
        userId,
        isMistake: true,
        lastSubject: alloc.subject,
        masteryStatus: { not: "MASTERED" },
      },
      select: { questionId: true },
      orderBy: [{ mistakeCount: "desc" }, { masteryScore: "asc" }],
      take: alloc.allocated,
    });
    allIds.push(...rows.map((r) => r.questionId));
  }

  return allIds;
}

export type MistakeSelectionFilters = {
  subject?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
};

/**
 * Get question IDs for a mistake exam that respects the caller's
 * subject/topic/subtopic preference. Every candidate is drawn ONLY from the
 * user's own mistake pool (isMistake = true, not mastered), then ordered by the
 * same priority scoring used elsewhere.
 */
export async function getMistakeQuestionIdsBySelection(
  userId: string,
  filters: MistakeSelectionFilters,
  limit: number,
  focus?: string,
): Promise<
  {
    questionId: number;
    mistakeCount: number;
    masteryScore: number;
    lastIncorrectAt: Date | null;
    nextReviewAt: Date | null;
    difficulty: string;
    totalAttempts: number;
  }[]
> {
  const questionFilter: Prisma.QuestionWhereInput = {};
  if (filters.difficulty) {
    questionFilter.difficulty = filters.difficulty as "EASY" | "MEDIUM" | "HARD";
  }
  if (filters.subject && filters.subject !== "অন্যান্য") {
    questionFilter.subject = { nameBn: filters.subject };
  }

  const where: Prisma.UserQuestionProgressWhereInput = {
    userId,
    isMistake: true,
    masteryStatus: { not: "MASTERED" },
  };

  if (filters.topic) {
    questionFilter.topic = { contains: filters.topic, mode: "insensitive" };
  }
  if (filters.subtopic) {
    questionFilter.subtopic = { contains: filters.subtopic, mode: "insensitive" };
  }

  if (Object.keys(questionFilter).length > 0) {
    where.question = questionFilter;
  }

  const orderBy: Prisma.UserQuestionProgressOrderByWithRelationInput =
    focus === "due_for_review"
      ? { nextReviewAt: "asc" }
      : focus === "most_wrong"
        ? { mistakeCount: "desc" }
        : focus === "recently_wrong"
          ? { lastIncorrectAt: "desc" }
          : focus === "weakest_topics"
            ? { masteryScore: "asc" }
            : { masteryScore: "asc", mistakeCount: "desc" };

  const fetchLimit = Math.min(limit * 3, 500);
  const rows = await prisma.userQuestionProgress.findMany({
    where,
    select: {
      questionId: true,
      mistakeCount: true,
      masteryScore: true,
      lastIncorrectAt: true,
      nextReviewAt: true,
      totalAttempts: true,
      question: { select: { difficulty: true } },
    },
    orderBy,
    take: fetchLimit,
  });

  return rows.map((r) => ({
    questionId: r.questionId,
    mistakeCount: r.mistakeCount,
    masteryScore: r.masteryScore,
    lastIncorrectAt: r.lastIncorrectAt,
    nextReviewAt: r.nextReviewAt,
    difficulty: r.question.difficulty,
    totalAttempts: r.totalAttempts,
  }));
}

/**
 * Build a subject → topic → subtopic selection tree scoped ONLY to the user's
 * own mistake pool. Each node carries the number of wrong questions available
 * under it so the dashboard can offer subject/topic/subtopic preference when
 * building a mistake exam. Includes unmastered + mastered so "wrong questions"
 * (the full history) can be surfaced; the builder itself ignores MASTERED.
 */
export async function getMistakeSelectionTree(
  userId: string,
): Promise<
  { subject: string; topic: string; subtopic: string; count: number }[]
> {
  const rows = await prisma.userQuestionProgress.findMany({
    where: { userId, isMistake: true },
    select: {
      question: {
        select: {
          subject: { select: { nameBn: true } },
          topic: true,
          subtopic: true,
        },
      },
    },
  });

  // Aggregate into a flattened (subject, topic, subtopic) -> count map.
  const counts = new Map<string, number>();
  for (const r of rows) {
    const subject = r.question?.subject?.nameBn || "অন্যান্য";
    const topic = r.question?.topic || "";
    const subtopic = r.question?.subtopic || "";
    const key = `${subject}|||${topic}|||${subtopic}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()].map(([key, count]) => {
    const [subject, topic, subtopic] = key.split("|||");
    return { subject, topic, subtopic, count };
  });
}

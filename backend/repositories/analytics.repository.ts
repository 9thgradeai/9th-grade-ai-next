// backend/repositories/analytics.repository.ts
// Data access for analytics/reporting read models. Repositories are the ONLY
// place (besides db.ts) allowed to call Prisma — route handlers and services
// must go through this layer. Raw SQL here is parameterized via Prisma's
// tagged-template ($queryRaw / $executeRaw); string concatenation is forbidden.

import "server-only";

import { prisma } from "~backend/db";

/**
 * Product timezone: every "day" boundary in analytics (activity windows,
 * streaks, studied-today) is an Asia/Dhaka calendar day, not UTC. A learner
 * studying at 00:30 Dhaka must credit today, not yesterday. Dhaka has no DST,
 * and calendar-day arithmetic on date keys is DST-immune regardless.
 */
export const APP_TIMEZONE = "Asia/Dhaka";

const dhakaDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Instant → YYYY-MM-DD calendar day in the product timezone. */
export function toAppDateKey(ms: number | Date): string {
  return dhakaDateFmt.format(ms instanceof Date ? ms : new Date(ms));
}

/** Calendar-day arithmetic on YYYY-MM-DD keys (tz-safe: keys are days, not instants). */
export function addDaysKey(key: string, deltaDays: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export type SubjectAttemptAggregate = {
  subjectName: string;
  attempted: number;
  correct: number;
};

export type TopicAttemptAggregate = {
  topic: string;
  attempted: number;
  correct: number;
};

/**
 * Per-subject attempt totals for one user, aggregated IN THE DATABASE.
 * Replaces the previous load-all-attempts-then-reduce-in-JS pattern so cost
 * is O(subjects) rows regardless of how many attempts the user accumulates.
 */
export async function aggregateAttemptsBySubject(
  userId: string,
): Promise<SubjectAttemptAggregate[]> {
  const rows = await prisma.$queryRaw<
    { subjectName: string; attempted: number; correct: number }[]
  >`
    SELECT "subjectName" AS "subjectName",
           COUNT(*)::int AS "attempted",
           COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
    GROUP BY "subjectName"`;

  return rows.map((r) => ({
    subjectName: r.subjectName ?? "",
    attempted: Number(r.attempted),
    correct: Number(r.correct),
  }));
}

/** Subjects in dashboard/display order. */
export async function fetchSubjectsOrdered(): Promise<{ nameBn: string }[]> {
  return prisma.subject.findMany({ orderBy: { sortOrder: "asc" }, select: { nameBn: true } });
}

/**
 * Per-topic attempt totals for one user (all history), aggregated IN THE
 * DATABASE. Feeds weak/strong-topic derivation without loading every row.
 */
export async function aggregateAttemptsByTopic(
  userId: string,
): Promise<TopicAttemptAggregate[]> {
  const rows = await prisma.$queryRaw<
    { topic: string | null; attempted: number; correct: number }[]
  >`
    SELECT "topic" AS "topic",
           COUNT(*)::int AS "attempted",
           COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
    GROUP BY "topic"`;

  return rows.map((r) => ({
    topic: r.topic ?? "",
    attempted: Number(r.attempted),
    correct: Number(r.correct),
  }));
}

export type RecentAccuracy = { total: number; correct: number };

/**
 * Distinct question ids whose MOST RECENT attempt by this user was incorrect.
 * Drives the Wrong-Answer Notebook: a question drops out the moment the user
 * answers it correctly (the latest attempt flips to correct). DISTINCT ON
 * keeps cost to ~one row per attempted question.
 */
export async function fetchWrongNotebookQuestionIds(
  userId: string,
  limit = 500,
): Promise<number[]> {
  const rows = await prisma.$queryRaw<
    { questionId: number; correct: boolean }[]
  >`
    SELECT DISTINCT ON ("questionId") "questionId", "correct"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId} AND "questionId" IS NOT NULL
    ORDER BY "questionId", "createdAt" DESC`;

  return rows.filter((r) => !r.correct).map((r) => Number(r.questionId)).slice(0, limit);
}

export type SubjectTopicAggregate = {
  subjectName: string;
  topic: string;
  attempted: number;
  correct: number;
  /** Newest attempt in the group (powers forgetting-risk flags). Null when none. */
  lastAttemptedAt: string | null;
};

/**
 * Per (subject, topic) attempt totals for one user, aggregated IN THE DATABASE.
 * Backs the weak-topic report (accuracy per topic within a subject).
 */
export async function aggregateAttemptsBySubjectTopic(
  userId: string,
): Promise<SubjectTopicAggregate[]> {
  const rows = await prisma.$queryRaw<
    { subjectName: string | null; topic: string | null; attempted: number; correct: number; lastAttemptedAt: Date | null }[]
  >`
    SELECT "subjectName" AS "subjectName",
           "topic" AS "topic",
           COUNT(*)::int AS "attempted",
           COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct",
           MAX("createdAt") AS "lastAttemptedAt"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
    GROUP BY "subjectName", "topic"`;

  return rows.map((r) => ({
    subjectName: r.subjectName ?? "",
    topic: r.topic ?? "",
    attempted: Number(r.attempted),
    correct: Number(r.correct),
    lastAttemptedAt: r.lastAttemptedAt ? new Date(r.lastAttemptedAt).toISOString() : null,
  }));
}

/** Correct/total over the trailing window, aggregated IN THE DATABASE. */
export async function aggregateRecentAccuracy(
  userId: string,
  days = 30,
): Promise<RecentAccuracy> {
  const rows = await prisma.$queryRaw<RecentAccuracy[]>`
    SELECT COUNT(*)::int AS "total",
           COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
      AND "createdAt" >= now() - ${days} * interval '1 day'`;

  const r = rows[0];
  return { total: Number(r?.total ?? 0), correct: Number(r?.correct ?? 0) };
}

export type DayActivity = { date: string; answered: number; correct: number; durationSec: number };

/** Per-product-day totals since `${days}-1` days ago, grouped IN THE DATABASE. */
export async function aggregateDailyActivity(
  userId: string,
  days = 7,
): Promise<DayActivity[]> {
  const rows = await prisma.$queryRaw<
    { date: string; answered: number; correct: number; durationSec: number }[]
  >`
    SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE '${APP_TIMEZONE}'), 'YYYY-MM-DD') AS "date",
           COUNT(*)::int AS "answered",
           COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct",
           COALESCE(SUM("durationSec"), 0)::int AS "durationSec"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
      AND "createdAt" >= now() - ${days} * interval '1 day'
    GROUP BY 1`;

  return rows.map((r) => ({
    date: String(r.date),
    answered: Number(r.answered),
    correct: Number(r.correct),
    durationSec: Number(r.durationSec),
  }));
}

/**
 * Pure zero-fill: expand sparse per-day rows into a continuous window ending
 * today (product timezone). Exported for unit testing.
 */
export function buildActivityWindow(
  rows: DayActivity[],
  days = 7,
  nowMs: number = Date.now(),
): DayActivity[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DayActivity[] = [];
  let key = toAppDateKey(nowMs);
  for (let i = 0; i < days; i++) {
    const hit = byDate.get(key);
    out.unshift({
      date: key,
      answered: hit?.answered ?? 0,
      correct: hit?.correct ?? 0,
      durationSec: hit?.durationSec ?? 0,
    });
    key = addDaysKey(key, -1);
  }
  return out;
}

/**
 * Server-authoritative study streak: consecutive product-timezone days with at
 * least one attempt, ending today or yesterday. Derived from the attempt log
 * so it can never be inflated by the client. Bounded to a year of distinct days.
 */
export async function computeStreak(userId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ day: string }[]>`
    SELECT DISTINCT to_char(date_trunc('day', "createdAt" AT TIME ZONE '${APP_TIMEZONE}'), 'YYYY-MM-DD') AS "day"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
      AND "createdAt" >= now() - interval '365 days'
    ORDER BY "day" DESC
    LIMIT 366`;

  if (rows.length === 0) return 0;

  const activeDays = new Set(rows.map((r) => String(r.day)));
  let streak = 0;
  // Start from today; allow yesterday as the streak anchor so the counter
  // doesn't reset to 0 before the user has studied today.
  let cursor = toAppDateKey(Date.now());
  if (!activeDays.has(cursor)) {
    cursor = addDaysKey(cursor, -1);
    if (!activeDays.has(cursor)) return 0;
  }
  while (activeDays.has(cursor)) {
    streak++;
    cursor = addDaysKey(cursor, -1);
  }
  return streak;
}

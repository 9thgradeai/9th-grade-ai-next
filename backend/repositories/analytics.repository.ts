// backend/repositories/analytics.repository.ts
// Data access for analytics/reporting read models. Repositories are the ONLY
// place (besides db.ts) allowed to call Prisma — route handlers and services
// must go through this layer. Raw SQL here is parameterized via Prisma's
// tagged-template ($queryRaw / $executeRaw); string concatenation is forbidden.

import "server-only";

import { prisma } from "~backend/db";

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

export type DayActivity = { date: string; answered: number; correct: number };

/** Per-UTC-day totals since `${days}-1` days ago, grouped IN THE DATABASE. */
export async function aggregateDailyActivity(
  userId: string,
  days = 7,
): Promise<DayActivity[]> {
  const rows = await prisma.$queryRaw<{ date: string; answered: number; correct: number }[]>`
    SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS "date",
           COUNT(*)::int AS "answered",
           COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS "correct"
    FROM "QuestionAttempt"
    WHERE "userId" = ${userId}
      AND "createdAt" >= now() - ${days} * interval '1 day'
    GROUP BY 1`;

  return rows.map((r) => ({
    date: String(r.date),
    answered: Number(r.answered),
    correct: Number(r.correct),
  }));
}

/**
 * Pure zero-fill: expand sparse per-day rows into a continuous window ending
 * today (UTC). Exported for unit testing.
 */
export function buildActivityWindow(
  rows: DayActivity[],
  days = 7,
  nowMs: number = Date.now(),
): DayActivity[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DayActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(nowMs - i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    const hit = byDate.get(key);
    out.push({ date: key, answered: hit?.answered ?? 0, correct: hit?.correct ?? 0 });
  }
  return out;
}

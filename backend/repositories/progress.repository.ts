// backend/repositories/progress.repository.ts
// Atomic UserProgress mutations. The recompute below is a SINGLE statement:
// it derives totals from the attempt log and upserts the progress row in one
// step, so concurrent submissions can never interleave a stale read-modify-
// write (the lost-update window the previous two-step count-then-update had).

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

type Db = Prisma.TransactionClient | PrismaClient;

/**
 * Recompute questionsAnswered/accuracy from the QuestionAttempt log and award
 * points (+ optional exam counter) atomically. Safe to call inside a
 * transaction (pass its client) or standalone (pass `prisma`).
 */
export async function recomputeAndAward(
  db: Db,
  userId: string,
  pointsEarned: number,
  examsIncrement = 0,
): Promise<void> {
  await db.$executeRaw`
    INSERT INTO "UserProgress"
      ("userId", "points", "questionsAnswered", "accuracy", "examsAttempted", "updatedAt")
    SELECT ${userId}, ${pointsEarned}, agg.total,
           CASE WHEN agg.total > 0 THEN ROUND((agg.correct * 100.0) / agg.total)::int ELSE 0 END,
           ${examsIncrement}, now()
    FROM (
      SELECT COUNT(*)::int AS total,
             COALESCE(SUM(CASE WHEN "correct" THEN 1 ELSE 0 END), 0)::int AS correct
      FROM "QuestionAttempt"
      WHERE "userId" = ${userId}
    ) AS agg
    ON CONFLICT ("userId") DO UPDATE SET
      "points" = "UserProgress"."points" + excluded."points",
      "questionsAnswered" = excluded."questionsAnswered",
      "accuracy" = excluded."accuracy",
      "examsAttempted" = "UserProgress"."examsAttempted" + excluded."examsAttempted",
      "updatedAt" = excluded."updatedAt"`;
}

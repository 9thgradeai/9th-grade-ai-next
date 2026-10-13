/**
 * scripts/reconcile-progress.ts
 * ----------------------------------------------------------------------------
 * Recomputes the award-derived UserProgress columns (points, questionsAnswered,
 * accuracy, examsAttempted) from the authoritative logs and fixes drift.
 *
 * Why this exists: the exam-submit path awards points POST-COMMIT (outside the
 * Serializable grading txn) so submits never serialize on the hot progress
 * row. If the process crashes between commit and award, the attempt is
 * SUBMITTED but its points are missing. This script is the crash-window
 * backfill — run it on a schedule (cron) or ad hoc.
 *
 * Sources of truth:
 *   • points         = Σ SUBMITTED ExamAttempt.summaryJson.summary.pointsEarned
 *                      (fallback: correct * POINTS_PER_CORRECT for old rows)
 *   • examsAttempted = COUNT SUBMITTED ExamAttempts
 *   • questionsAnswered / accuracy = derived from the QuestionAttempt log
 *                      (same derivation as recomputeAndAward)
 *
 * Untouched: streak, flashcardsReviewed, aiQuestionsAsked, rank.
 *
 * Usage:
 *   npx tsx scripts/reconcile-progress.ts [--dry-run] [--userId <id>]
 *   Default is dry-run (report only). Pass --apply to write.
 */

import { PrismaClient } from "@prisma/client";
import { POINTS_PER_CORRECT } from "~backend/services/exam-submission";

const prisma = new PrismaClient();

type SummarySnapshot = {
  summary?: { pointsEarned?: unknown; correct?: unknown };
};

function pointsFromSnapshot(snapshot: unknown): number {
  const s = (snapshot as SummarySnapshot | null)?.summary;
  if (typeof s?.pointsEarned === "number" && Number.isFinite(s.pointsEarned)) {
    return Math.max(0, Math.round(s.pointsEarned));
  }
  if (typeof s?.correct === "number" && Number.isFinite(s.correct)) {
    return Math.max(0, Math.round(s.correct)) * POINTS_PER_CORRECT;
  }
  return 0;
}

async function reconcileUser(userId: string, apply: boolean) {
  const [attempts, total, correctCount] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { userId, status: "SUBMITTED" },
      select: { summaryJson: true },
    }),
    prisma.questionAttempt.count({ where: { userId } }),
    prisma.questionAttempt.count({ where: { userId, correct: true } }),
  ]);
  const expected = {
    points: attempts.reduce((sum, a) => sum + pointsFromSnapshot(a.summaryJson), 0),
    examsAttempted: attempts.length,
    questionsAnswered: total,
    accuracy: total > 0 ? Math.round((correctCount * 100) / total) : 0,
  };

  const current = await prisma.userProgress.findUnique({ where: { userId } });
  const drifted =
    !current ||
    current.points !== expected.points ||
    current.examsAttempted !== expected.examsAttempted ||
    current.questionsAnswered !== expected.questionsAnswered ||
    current.accuracy !== expected.accuracy;

  if (!drifted) return { userId, fixed: false as const };

  if (apply) {
    await prisma.userProgress.upsert({
      where: { userId },
      create: { userId, ...expected },
      update: { ...expected },
    });
  }
  return {
    userId,
    fixed: apply,
    before: current
      ? {
          points: current.points,
          examsAttempted: current.examsAttempted,
          questionsAnswered: current.questionsAnswered,
          accuracy: current.accuracy,
        }
      : null,
    after: expected,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const userIdx = args.indexOf("--userId");
  const onlyUser = userIdx >= 0 ? args[userIdx + 1] : undefined;

  const users = onlyUser
    ? [{ userId: onlyUser }]
    : await prisma.examAttempt.findMany({
        where: { status: "SUBMITTED" },
        select: { userId: true },
        distinct: ["userId"],
      });

  const results = [];
  for (const u of users) {
    results.push(await reconcileUser(u.userId, apply));
  }
  const drifted = results.filter((r) => "after" in r);
  console.log(
    JSON.stringify(
      { mode: apply ? "apply" : "dry-run", checked: users.length, drifted: drifted.length, details: drifted },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

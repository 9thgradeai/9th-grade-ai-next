/**
 * scripts/prune-activity.ts
 * ----------------------------------------------------------------------------
 * Deletes expired/ephemeral rows so per-user timelines don't grow forever:
 *   • Session            — expired rows (expiresAt < now). Login also prunes
 *                          on write; this catches sessions abandoned mid-life.
 *   • LearningEvent      — older than 180 days (pure telemetry; the derived
 *                          intelligence lives in mastery/progress rows).
 *   • AIUsage            — older than 365 days (quotas use the daily window;
 *                          the usage UI shows the last 14 days).
 *
 * Deliberately NOT pruned: QuestionAttempt (lifetime accuracy/streaks and
 * recomputeAndAward derive from it), FlashcardReview, ExamAttempt.
 *
 * Usage:
 *   npx tsx scripts/prune-activity.ts [--dry-run] [--apply]
 *   Default is dry-run (report only). Pass --apply to delete.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEARNING_EVENT_RETENTION_DAYS = 180;
const AI_USAGE_RETENTION_DAYS = 365;

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const now = new Date();

  const cutoffs = {
    session: now,
    learningEvent: new Date(now.getTime() - LEARNING_EVENT_RETENTION_DAYS * 86_400_000),
    aiUsage: new Date(now.getTime() - AI_USAGE_RETENTION_DAYS * 86_400_000),
  };

  const [expiredSessions, oldEvents, oldUsage] = await Promise.all([
    prisma.session.count({ where: { expiresAt: { lt: cutoffs.session } } }),
    prisma.learningEvent.count({ where: { occurredAt: { lt: cutoffs.learningEvent } } }),
    prisma.aIUsage.count({ where: { createdAt: { lt: cutoffs.aiUsage } } }),
  ]);

  let deleted = { expiredSessions: 0, oldEvents: 0, oldUsage: 0 };
  if (apply) {
    const [s, e, u] = await Promise.all([
      prisma.session.deleteMany({ where: { expiresAt: { lt: cutoffs.session } } }),
      prisma.learningEvent.deleteMany({ where: { occurredAt: { lt: cutoffs.learningEvent } } }),
      prisma.aIUsage.deleteMany({ where: { createdAt: { lt: cutoffs.aiUsage } } }),
    ]);
    deleted = { expiredSessions: s.count, oldEvents: e.count, oldUsage: u.count };
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        eligible: { expiredSessions, oldEvents, oldUsage },
        ...(apply ? { deleted } : {}),
      },
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

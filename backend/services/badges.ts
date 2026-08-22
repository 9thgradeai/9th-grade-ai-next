// backend/services/badges.ts — achievement awarding (Phase 11 subscribers).
// Badge unlocks are derived from domain events that services already emit
// after their transactions commit. Awarding is idempotent: UserBadge has a
// unique [userId, badgeId] and we upsert-with-skip, so duplicate events or
// process restarts can never double-award.

import "server-only";

import { prisma } from "~backend/db";
import { computeStreak } from "~backend/repositories/analytics.repository";
import type { DomainEvent } from "~backend/events/types";

/** Catalog names must match the seeded Badge rows (frontend/lib/data/study.ts). */
const BADGE_NAMES = {
  quizBeginner: "Quiz Beginner",
  streak3: "3-Day Streak",
  streak7: "Week Warrior",
  mockMaster: "Mock Master",
  flashcardPro: "Flashcard Pro",
} as const;

async function awardBadge(userId: string, name: string): Promise<boolean> {
  const badge = await prisma.badge.findUnique({ where: { name }, select: { id: true } });
  if (!badge) return false;
  const existing = await prisma.userBadge.findUnique({
    where: { userId_badgeId: { userId, badgeId: badge.id } },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.userBadge.create({ data: { userId, badgeId: badge.id } });
  return true;
}

async function awardStreakBadges(userId: string): Promise<void> {
  const streak = await computeStreak(userId);
  if (streak >= 3) await awardBadge(userId, BADGE_NAMES.streak3);
  if (streak >= 7) await awardBadge(userId, BADGE_NAMES.streak7);
}

/**
 * Evaluate one domain event against badge rules and award anything earned.
 * Never throws into the event bus — failures are logged by bus.emit().
 */
export async function evaluateBadgesForEvent(event: DomainEvent): Promise<void> {
  switch (event.name) {
    case "DAILY_QUIZ_COMPLETED": {
      await awardBadge(event.userId, BADGE_NAMES.quizBeginner);
      await awardStreakBadges(event.userId);
      break;
    }
    case "EXAM_COMPLETED": {
      const total = event.correct + event.wrong;
      if (total >= 5 && event.correct / total >= 0.8) {
        await awardBadge(event.userId, BADGE_NAMES.mockMaster);
      }
      await awardStreakBadges(event.userId);
      break;
    }
    case "PRACTICE_SUBMITTED": {
      await awardStreakBadges(event.userId);
      break;
    }
    case "FLASHCARD_REVIEWED": {
      const reviewed = await prisma.flashcardReview.count({
        where: { userId: event.userId },
      });
      if (reviewed >= 100) await awardBadge(event.userId, BADGE_NAMES.flashcardPro);
      await awardStreakBadges(event.userId);
      break;
    }
    default:
      break;
  }
}

// context/slices.ts — live data slice loaders (application layer).
// Each loader fetches a compact block of real domain data for a task's
// resolved plan; failures degrade gracefully to an absent slice so a slow
// sub-query can never block an AI turn. Values are facts — the LLM interprets
// them, never the other way around.

import "server-only";

import { prisma } from "~backend/db";
import { getMockTestResults, getStudyPlan } from "~backend/services/content";
import { todayBengaliName } from "~backend/services/study-plan";
import { analyzeMistakePatterns } from "../analysis/mistakes";
import type { ContextSliceKey, ContextSlices } from "../types";

const DAY_MS = 86_400_000;

async function loadExamSlice(userId: string): Promise<ContextSlices["exam"]> {
  const [user, nextExam] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { examTarget: true, examDate: true },
    }),
    prisma.examSchedule.findFirst({
      where: { verified: true, date: { gte: new Date() } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: { titleBn: true, titleEn: true, type: true, date: true },
    }),
  ]);
  return {
    examTarget: user?.examTarget ?? undefined,
    personalExamDate: user?.examDate?.toISOString(),
    nextExam: nextExam
      ? {
          titleBn: nextExam.titleBn,
          titleEn: nextExam.titleEn,
          type: nextExam.type,
          date: nextExam.date.toISOString(),
        }
      : null,
    daysLeft: nextExam
      ? Math.max(0, Math.ceil((nextExam.date.getTime() - Date.now()) / DAY_MS))
      : null,
  };
}

async function loadTodayPlanSlice(userId: string): Promise<ContextSlices["todayPlan"]> {
  const tasks = await getStudyPlan(userId);
  const today = todayBengaliName();
  const todays = tasks.filter((t) => t.day === today);
  const remaining = todays.filter((t) => !t.completed);
  return {
    total: todays.length,
    remaining: remaining.length,
    highPriorityRemaining: remaining.filter((t) => t.priority === "high").length,
    firstTitle: remaining[0]?.title ?? "",
    dayName: today,
  };
}

async function loadRevisionSlice(userId: string): Promise<ContextSlices["revision"]> {
  const now = new Date();
  const [flashcardsDue, mistakeReviewsDue] = await Promise.all([
    prisma.flashcardUserState.count({ where: { userId, nextReview: { lte: now } } }),
    prisma.userQuestionProgress.count({ where: { userId, nextReviewAt: { lte: now } } }),
  ]);
  return { flashcardsDue, mistakeReviewsDue };
}

async function loadMistakesSlice(userId: string): Promise<ContextSlices["mistakes"]> {
  const result = await analyzeMistakePatterns(userId);
  return { patterns: result.patterns, recentWrongCount: result.recentWrongCount };
}

async function loadMockPerformanceSlice(userId: string): Promise<ContextSlices["mockPerformance"]> {
  const rows = await getMockTestResults(userId);
  const scored = rows.filter((r) => r.total > 0).slice(0, 5);
  const average = scored.length > 0
    ? Math.round((scored.reduce((sum, r) => sum + r.score, 0) / scored.length) * 10) / 10
    : null;
  return { average, count: scored.length };
}

const LOADERS: Record<ContextSliceKey, (userId: string) => Promise<unknown>> = {
  exam: loadExamSlice,
  todayPlan: loadTodayPlanSlice,
  revision: loadRevisionSlice,
  mistakes: loadMistakesSlice,
  mockPerformance: loadMockPerformanceSlice,
};

/**
 * Load exactly the requested slices for a user. Duplicate keys are only loaded
 * once; a failing loader resolves to `undefined` for that key.
 */
export async function loadContextSlices(
  userId: string,
  keys: ContextSliceKey[],
): Promise<ContextSlices> {
  if (keys.length === 0) return {};
  const unique = [...new Set(keys)];
  const entries = await Promise.all(
    unique.map(async (key) => {
      try {
        return [key, await LOADERS[key](userId)] as const;
      } catch (err) {
        console.error(`[ai:slices] failed to load "${key}"`, err);
        return [key, undefined] as const;
      }
    }),
  );
  const slices: ContextSlices = {};
  for (const [key, value] of entries) {
    if (value !== undefined) (slices as Record<string, unknown>)[key] = value;
  }
  return slices;
}
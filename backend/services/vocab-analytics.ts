import "server-only";
import { prisma } from "~backend/db";

export type VocabAnalytics = {
  overview: {
    totalWords: number;
    wordsLearned: number;
    wordsMastered: number;
    masteryRate: number;
    averageAccuracy: number;
    totalReviews: number;
    studyStreak: number;
  };
  difficultyBreakdown: { difficulty: string; count: number; mastered: number }[];
  posBreakdown: { partOfSpeech: string; count: number; learned: number }[];
  recentActivity: { date: string; wordsReviewed: number; accuracy: number }[];
  topWeakWords: { word: string; accuracy: number; reviews: number }[];
  weeklyGoalProgress: { day: string; reviewed: number; goal: number }[];
};

const DAILY_GOAL = 20;

export async function getVocabAnalytics(userId: string): Promise<VocabAnalytics> {
  const totalWords = await prisma.vocabWord.count();

  const progresses = await prisma.vocabProgress.findMany({
    where: { userId },
    include: { word: { select: { word: true, difficulty: true, partOfSpeech: true } } },
  });

  const masteredCount = progresses.filter((p) => p.status === "MASTERED").length;
  const learnedCount = progresses.filter((p) => p.status !== "NEW").length;

  const totalReviews = progresses.reduce((sum, p) => sum + p.totalReviews, 0);
  const totalCorrect = progresses.reduce((sum, p) => sum + p.correctCount, 0);
  const averageAccuracy = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) : 0;
  const masteryRate = totalWords > 0 ? Math.round((masteredCount / totalWords) * 100) : 0;

  const streak = await computeStreak(userId);

  const difficultyMap = new Map<string, { count: number; mastered: number }>();
  for (const p of progresses) {
    const d = p.word.difficulty;
    const entry = difficultyMap.get(d) ?? { count: 0, mastered: 0 };
    entry.count++;
    if (p.status === "MASTERED") entry.mastered++;
    difficultyMap.set(d, entry);
  }
  const difficultyBreakdown = Array.from(difficultyMap.entries()).map(([difficulty, data]) => ({
    difficulty,
    ...data,
  }));

  const posMap = new Map<string, { count: number; learned: number }>();
  for (const p of progresses) {
    const pos = p.word.partOfSpeech;
    const entry = posMap.get(pos) ?? { count: 0, learned: 0 };
    entry.count++;
    if (p.status !== "NEW") entry.learned++;
    posMap.set(pos, entry);
  }
  const posBreakdown = Array.from(posMap.entries()).map(([partOfSpeech, data]) => ({
    partOfSpeech,
    ...data,
  }));

  const recentActivity: { date: string; wordsReviewed: number; accuracy: number }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayProgresses = progresses.filter(
      (p) => p.lastReviewedAt && p.lastReviewedAt >= dayStart && p.lastReviewedAt < dayEnd,
    );
    const wordsReviewed = dayProgresses.length;
    const dayReviews = dayProgresses.reduce((s, p) => s + p.totalReviews, 0);
    const dayCorrect = dayProgresses.reduce((s, p) => s + p.correctCount, 0);
    const accuracy = dayReviews > 0 ? Math.round((dayCorrect / dayReviews) * 100) : 0;

    recentActivity.push({
      date: dayStart.toISOString().slice(0, 10),
      wordsReviewed,
      accuracy,
    });
  }

  const topWeakWords = progresses
    .filter((p) => p.totalReviews >= 2)
    .map((p) => ({
      word: p.word.word,
      accuracy: Math.round((p.correctCount / p.totalReviews) * 100),
      reviews: p.totalReviews,
    }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);

  const weeklyGoalProgress: { day: string; reviewed: number; goal: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const count = progresses.filter(
      (p) => p.lastReviewedAt && p.lastReviewedAt >= dayStart && p.lastReviewedAt < dayEnd,
    ).length;

    weeklyGoalProgress.push({
      day: dayStart.toISOString().slice(0, 10),
      reviewed: count,
      goal: DAILY_GOAL,
    });
  }

  return {
    overview: {
      totalWords,
      wordsLearned: learnedCount,
      wordsMastered: masteredCount,
      masteryRate,
      averageAccuracy,
      totalReviews,
      studyStreak: streak,
    },
    difficultyBreakdown,
    posBreakdown,
    recentActivity,
    topWeakWords,
    weeklyGoalProgress,
  };
}

async function computeStreak(userId: string): Promise<number> {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const dayStart = new Date(d);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const count = await prisma.vocabProgress.count({
      where: { userId, lastReviewedAt: { gte: dayStart, lt: dayEnd } },
    });
    if (count === 0) break;
    streak++;
  }
  return streak;
}

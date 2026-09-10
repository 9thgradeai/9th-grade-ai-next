// backend/services/preparation-intelligence.ts
// Server-side preparation intelligence layer for the dashboard (Home + Progress).
//
// ONE source of truth rule: every metric below is derived from the same DB
// aggregates that power the exam / practice / mistake / flashcard system, so
// Home and Progress can never disagree. Nothing is fabricated — when the user
// has no data, fields report honest zeros / empty arrays.
//
// Metric scopes (documented semantics):
//   - overall      : the user's ENTIRE history (all time).
//   - period       : trailing 30-day window vs the preceding 30-day window.
//   - activity     : zero-filled UTC-day window (365 days) for client charts.
//   - subject*     : all-time per-subject accuracy (attempts with > 0 rows).
//   - weakTopics   : all-time lowest-accuracy topics, min 3 attempts.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import {
  aggregateAttemptsBySubjectTopic,
  aggregateDailyActivity,
  buildActivityWindow,
  computeStreak,
} from "~backend/repositories/analytics.repository";
import { getWeakTopics } from "~backend/services/analytics";
import { getMockTestResults, getStudyPlan } from "~backend/services/content";
import {
  getMistakeStatsForUser,
  getMistakesBySubjectForUser,
  getOverallStatsForUser,
} from "~backend/services/question-progress";
import type {
  PreparationIntelligenceDTO,
  PrepIntelligencePeriodComparison,
  PrepIntelligenceRecommendation,
  PrepIntelligenceSubjectPerformance,
  PrepIntelligenceTopicPerformance,
} from "@/lib/types";

/** Longest activity window the client charts against ("ALL" = 365 days). */
const ACTIVITY_WINDOW_DAYS = 365;
/** Two adjacent windows used for period-over-period comparison. */
const COMPARISON_WINDOW_DAYS = 30;
/** Minimum attempts before a subject/topic is eligible for weak-rankings. */
const MIN_CONFIDENT_ATTEMPTS = 3;
/** Subjects surfaced in the mastery list (top-N by attempts). */
const MAX_SUBJECTS = 12;

const round = (n: number) => Math.round(n * 10) / 10;

function computePeriodComparison(
  activity: { date: string; answered: number; correct: number; durationSec: number }[],
  days: number,
): PrepIntelligencePeriodComparison {
  const n = activity.length;
  const currentRows = activity.slice(n - days);
  const previousRows = activity.slice(Math.max(0, n - days * 2), Math.max(0, n - days));
  const sum = (rows: { answered: number; correct: number; durationSec: number }[]) =>
    rows.reduce(
      (a, r) => ({
        answered: a.answered + r.answered,
        correct: a.correct + r.correct,
        durationSec: a.durationSec + r.durationSec,
      }),
      { answered: 0, correct: 0, durationSec: 0 },
    );
  const cur = sum(currentRows);
  const prev = sum(previousRows);
  const currentAccuracy = cur.answered > 0 ? round((cur.correct / cur.answered) * 100) : 0;
  const previousAccuracy = prev.answered > 0 ? round((prev.correct / prev.answered) * 100) : 0;
  return {
    currentAccuracy,
    previousAccuracy,
    accuracyDelta: round(currentAccuracy - previousAccuracy),
    currentAttempts: cur.answered,
    previousAttempts: prev.answered,
    attemptsDelta: cur.answered - prev.answered,
    currentCorrect: cur.correct,
    previousCorrect: prev.correct,
    correctDelta: cur.correct - prev.correct,
    currentStudyTimeSec: cur.durationSec,
    previousStudyTimeSec: prev.durationSec,
    studyTimeDeltaSec: cur.durationSec - prev.durationSec,
  };
}

function buildSubjectPerformance(
  rows: { subjectName: string; topic: string; attempted: number; correct: number }[],
): PrepIntelligenceSubjectPerformance[] {
  const bySubject = new Map<
    string,
    { attempted: number; correct: number; topics: PrepIntelligenceTopicPerformance[] }
  >();
  for (const r of rows) {
    if (r.attempted <= 0) continue;
    const subject = r.subjectName || "অন্যান্য";
    let entry = bySubject.get(subject);
    if (!entry) {
      entry = { attempted: 0, correct: 0, topics: [] };
      bySubject.set(subject, entry);
    }
    entry.attempted += r.attempted;
    entry.correct += r.correct;
    entry.topics.push({
      subject,
      topic: r.topic,
      attempted: r.attempted,
      correct: r.correct,
      accuracy: round((r.correct / r.attempted) * 100),
    });
  }
  return [...bySubject.entries()]
    .map(([subject, e]) => ({
      subject,
      attempted: e.attempted,
      correct: e.correct,
      accuracy: round((e.correct / e.attempted) * 100),
      topics: e.topics.sort((a, b) => b.attempted - a.attempted),
    }))
    .sort((a, b) => b.attempted - a.attempted)
    .slice(0, MAX_SUBJECTS);
}

type RecommendationInput = {
  subjectPerformance: PrepIntelligenceSubjectPerformance[];
  weakTopics: { subject: string; topic: string; score: number; attempted: number }[];
  unmasteredMistakes: number;
  flashcardsDue: number;
  dailyQuizAvailable: boolean;
  studiedToday: boolean;
  unfinishedExams: number;
  examDaysLeft: number | null;
};

function buildRecommendations(input: RecommendationInput): PrepIntelligenceRecommendation[] {
  const recs: PrepIntelligenceRecommendation[] = [];

  // 1. An exam the candidate already started → highest value: finish it.
  if (input.unfinishedExams > 0) {
    recs.push({
      id: "resume-exam",
      priority: "high",
      target: "practice",
    });
  }

  // 2. Weakest subject with enough attempts to be confident.
  const weakestSubject = input.subjectPerformance
    .filter((s) => s.attempted >= MIN_CONFIDENT_ATTEMPTS)
    .sort((a, b) => a.accuracy - b.accuracy)[0];
  if (weakestSubject && weakestSubject.accuracy < 60) {
    recs.push({
      id: "practice-weak-subject",
      priority: "high",
      target: "practice",
      subject: weakestSubject.subject,
      accuracy: weakestSubject.accuracy,
      count: weakestSubject.attempted,
    });
  }

  // 3. Weakest topic (confidence-aware: >= 3 attempts).
  const weakestTopic = input.weakTopics.find((t) => t.attempted >= MIN_CONFIDENT_ATTEMPTS);
  if (weakestTopic && weakestTopic.score < 65) {
    recs.push({
      id: "practice-weak-topic",
      priority: "high",
      target: "practice",
      subject: weakestTopic.subject,
      topic: weakestTopic.topic,
      accuracy: weakestTopic.score,
      count: weakestTopic.attempted,
    });
  }

  // 4. Unresolved mistakes → review them.
  if (input.unmasteredMistakes > 0) {
    recs.push({
      id: "review-mistakes",
      priority: "medium",
      target: "mistakes",
      count: input.unmasteredMistakes,
    });
  }

  // 5. Due flashcards → spaced repetition requires the daily window.
  if (input.flashcardsDue > 0) {
    recs.push({
      id: "review-flashcards",
      priority: "medium",
      target: "flashcards",
      count: input.flashcardsDue,
    });
  }

  // 6. Exam approaching → a mock test strategy matters.
  if (input.examDaysLeft != null && input.examDaysLeft <= 30 && input.examDaysLeft >= 0) {
    recs.push({
      id: "exam-near",
      priority: "medium",
      target: "practice",
      count: input.examDaysLeft,
    });
  }

  // 7. Daily quiz → short, high-value warm-up.
  if (input.dailyQuizAvailable) {
    recs.push({ id: "daily-quiz", priority: "medium", target: "practice" });
  }

  // 8. Not studied today → protect the streak with a warm-up.
  if (!input.studiedToday) {
    recs.push({ id: "daily-warmup", priority: "medium", target: "practice" });
  }

  // 9. Fallback — keep momentum.
  if (recs.length === 0) {
    recs.push({ id: "keep-going", priority: "low", target: "practice" });
  }

  return recs.slice(0, 4);
}

export async function getPreparationIntelligence(userId: string): Promise<PreparationIntelligenceDTO> {
  try {
    const [
      progress,
      overall,
      streak,
      subjectTopicAgg,
      weakTopicRows,
      flashcardDueCount,
      mistakeStats,
      mistakeSubjects,
      recentResults,
      studyTasks,
      nextExam,
      unfinishedExams,
      masteries,
      dailyActivityRaw,
      dailyQuizAvailable,
      practiceStudySec,
      mockStudySec,
    ] = await Promise.all([
      prisma.userProgress.findUnique({ where: { userId } }),
      getOverallStatsForUser(userId),
      computeStreak(userId),
      aggregateAttemptsBySubjectTopic(userId),
      getWeakTopics(userId, { limit: 8 }),
      prisma.flashcardUserState.count({ where: { userId, nextReview: { lte: new Date() } } }),
      getMistakeStatsForUser(userId),
      getMistakesBySubjectForUser(userId),
      getMockTestResults(userId),
      getStudyPlan(userId),
      prisma.examSchedule.findFirst({
        where: { verified: true, date: { gte: new Date() } },
        orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.examAttempt.findMany({
        where: { userId, status: { in: ["IN_PROGRESS", "SUBMITTING"] } },
        orderBy: { startedAt: "desc" },
        take: 3,
        select: { id: true, startedAt: true },
      }),
      prisma.userQuestionProgress.groupBy({
        by: ["masteryStatus"],
        where: { userId },
        _count: { _all: true },
      }),
      aggregateDailyActivity(userId, ACTIVITY_WINDOW_DAYS),
      prisma.dailyQuizParticipation.findFirst({
        where: { userId, status: { not: "COMPLETED" } },
        select: { id: true },
      }),
      prisma.questionAttempt.aggregate({
        where: { userId },
        _sum: { durationSec: true },
      }),
      prisma.mockTestResult.aggregate({
        where: { userId },
        _sum: { durationSec: true },
      }),
    ]);

    const activity = buildActivityWindow(dailyActivityRaw, ACTIVITY_WINDOW_DAYS);
    const period = computePeriodComparison(activity, COMPARISON_WINDOW_DAYS);
    const subjectPerformance = buildSubjectPerformance(subjectTopicAgg);

    const todayKey = new Date().toISOString().slice(0, 10);
    const studiedToday = activity.some(
      (d) => d.date === todayKey && d.answered > 0,
    );

    const examDaysLeft = nextExam
      ? Math.max(0, Math.ceil((nextExam.date.getTime() - Date.now()) / 86_400_000))
      : null;

    const rank =
      progress && progress.points > 0
        ? (await prisma.userProgress.count({ where: { points: { gt: progress.points } } })) + 1
        : progress? 1 : 0;

    const studyTimeSec =
      Number(practiceStudySec._sum.durationSec ?? 0) + Number(mockStudySec._sum.durationSec ?? 0);

    const unfinishedActivities = unfinishedExams.map((e) => ({
      type: "mock_test" as const,
      id: String(e.id),
      startedAt: e.startedAt.toISOString(),
    }));

    const recommendations = buildRecommendations({
      subjectPerformance,
      weakTopics: weakTopicRows,
      unmasteredMistakes: mistakeStats.unmastered,
      flashcardsDue: flashcardDueCount,
      dailyQuizAvailable: dailyQuizAvailable !== null,
      studiedToday,
      unfinishedExams: unfinishedExams.length,
      examDaysLeft,
    });

    return {
      overall: {
        totalAttempts: overall.totalAttempts,
        totalCorrect: overall.totalCorrect,
        totalWrong: overall.totalWrong,
        accuracy: overall.accuracy,
        questionsAttempted: overall.questionsAttempted,
        points: progress?.points ?? 0,
        rank,
        streak,
        flashcardsReviewed: progress?.flashcardsReviewed ?? 0,
        aiQuestionsAsked: progress?.aiQuestionsAsked ?? 0,
        examsAttempted: progress?.examsAttempted ?? 0,
        studyTimeSec,
      },
      activity,
      period,
      subjectPerformance,
      weakTopics: weakTopicRows,
      flashcardsDue: flashcardDueCount,
      streak,
      masteryDistribution: masteries.map((m) => ({
        status: m.masteryStatus,
        count: m._count._all,
      })),
      mistakes: {
        totalMistakes: mistakeStats.totalMistakes,
        unmastered: mistakeStats.unmastered,
        struggling: mistakeStats.struggling,
        reviewing: mistakeStats.reviewing,
        improving: mistakeStats.improving,
        mastered: mistakeStats.mastered,
        bySubject: mistakeSubjects,
      },
      recentResults,
      nextExam: nextExam
        ? {
            id: nextExam.id,
            titleBn: nextExam.titleBn,
            titleEn: nextExam.titleEn,
            type: nextExam.type,
            date: nextExam.date.toISOString(),
            year: nextExam.year,
            circularNo: nextExam.circularNo,
            note: nextExam.note,
            sourceUrl: nextExam.sourceUrl ?? undefined,
            verified: nextExam.verified,
          }
        : null,
      studyTasks,
      unfinishedActivities,
      recommendations,
      dailyQuizAvailable: dailyQuizAvailable !== null,
    };
  } catch (err) {
    console.error("[preparation-intelligence] failed:", err);
    throw new InternalServerError("Failed to build preparation intelligence");
  }
}
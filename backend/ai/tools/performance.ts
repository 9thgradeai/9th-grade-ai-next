// Tools reading student performance & readiness from the real DB.

import "server-only";

import { prisma } from "~backend/db";
import { getSubjectReports, getWeakTopics } from "~backend/services/analytics";
import { getOverallStatsForUser } from "~backend/services/question-progress";
import { clamp, posInt, type ToolContext, type ToolDefinition, type ToolResult } from "./types";

const STATUS_LABEL: Record<string, string> = {
  NEW: "new",
  STRUGGLING: "struggling",
  REVIEWING: "reviewing",
  IMPROVING: "improving",
  MASTERED: "mastered",
};

async function masteryData(userId: string) {
  const [reports, weak, statuses, stats] = await Promise.all([
    getSubjectReports(userId),
    getWeakTopics(userId, { minAttempts: 2, limit: 6 }),
    prisma.userQuestionProgress.groupBy({
      by: ["masteryStatus"],
      where: { userId },
      _count: { _all: true },
    }),
    getOverallStatsForUser(userId),
  ]);
  return { reports, weak, statuses, stats };
}

export const getMyMastery: ToolDefinition = {
  name: "get_my_mastery",
  description:
    "Per-subject accuracy plus mastery-status distribution (new/struggling/reviewing/improving/mastered) and the weakest topics. No arguments.",
  inputShape: "{}",
  validateInput(raw) {
    return raw && typeof raw === "object" ? {} : {};
  },
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const { reports, weak, statuses, stats } = await masteryData(ctx.userId);
    const dist = Object.fromEntries(statuses.map((s) => [s.masteryStatus, s._count._all]));
    const weakest = reports.filter((r) => r.attempted >= 2).sort((a, b) => a.score - b.score)[0];
    return {
      summary:
        `Subject accuracy: ${reports
          .map((r) => `${r.name} ${r.attempted ? `${r.score}%` : "no attempts"}`)
          .join(", ")}. ` +
        `Overall accuracy ${stats.totalAttempts ? `${Math.round(stats.accuracy)}%` : "no attempts"}. `,
      data: {
        subjects: reports,
        weakTopics: weak,
        masteryDistribution: dist,
        weakestSubject: weakest?.name ?? "",
        overallAccuracy: stats.totalAttempts ? Math.round(stats.accuracy) : 0,
      },
    };
  },
};

export const getRecentActivity: ToolDefinition = {
  name: "get_recent_activity",
  description:
    "Recent learning activity: latest answered questions (practice/mock/daily) and flashcard reviews, newest first. No arguments.",
  inputShape: "{}",
  validateInput(raw) {
    return raw && typeof raw === "object" ? {} : {};
  },
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const [attempts, flashcards] = await Promise.all([
      prisma.questionAttempt.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { questionId: true, correct: true, subjectName: true, topic: true, createdAt: true },
      }),
      prisma.flashcardReview.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { rating: true, createdAt: true },
      }),
    ]);
    const items = [
      ...attempts.map((a) => ({
        kind: a.correct ? "correct" : "incorrect",
        detail: a.topic || a.subjectName || "question",
        at: a.createdAt,
      })),
      ...flashcards.map((f) => ({
        kind: "flashcard",
        detail: `rating ${f.rating}`,
        at: f.createdAt,
      })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());
    return {
      summary:
        items.length === 0
          ? "No recent activity."
          : items
              .slice(0, 10)
              .map((i) => `${i.kind}: ${i.detail}`)
              .join("; "),
      data: { items: items.slice(0, 10).map((i) => ({ kind: i.kind, detail: i.detail })) },
    };
  },
};

export const getQuestionHistory: ToolDefinition = {
  name: "get_question_history",
  description:
    "Recently attempted questions with their mastery state (status and attempt counts), newest first. Optional argument: limit (default 10, max 25).",
  inputShape: '{"limit": 10}',
  validateInput(raw) {
    const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return { limit: posInt(args, "limit", 10) ?? 10 };
  },
  async execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult> {
    const limit = clamp(args.limit as number, 1, 25);
    const rows = await prisma.userQuestionProgress.findMany({
      where: { userId: ctx.userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        questionId: true,
        totalAttempts: true,
        correctAttempts: true,
        masteryStatus: true,
        isMistake: true,
        lastSubject: true,
        lastTopic: true,
        question: { select: { question: true } },
      },
    });
    if (rows.length === 0) return { summary: "No question history yet.", data: { items: [] } };
    return {
      summary: rows
        .map(
          (r) =>
            `Q${r.questionId} (${r.lastTopic || "topic unknown"}): ${STATUS_LABEL[r.masteryStatus]}`,
        )
        .join("; "),
      data: {
        items: rows.map((r) => ({
          questionId: r.questionId,
          topic: r.lastTopic,
          subject: r.lastSubject,
          status: r.masteryStatus,
          isMistake: r.isMistake,
          attempts: r.totalAttempts,
          correct: r.correctAttempts,
          text: r.question?.question ?? "",
        })),
      },
    };
  },
};

export const calculateReadiness: ToolDefinition = {
  name: "calculate_readiness",
  description:
    "Overall exam-readiness score (0–100) combining subject accuracy, coverage and mistake pressure, plus a plain-language readiness label and the single weakest subject. No arguments.",
  inputShape: "{}",
  validateInput(raw) {
    return raw && typeof raw === "object" ? {} : {};
  },
  async execute(ctx: ToolContext): Promise<ToolResult> {
    const { reports, weak, statuses, stats } = await masteryData(ctx.userId);
    const mastered = statuses.find((s) => s.masteryStatus === "MASTERED")?._count._all ?? 0;
    const attemptedQuestions = statuses.reduce((sum, s) => sum + s._count._all, 0);
    const subjectScore =
      reports.filter((r) => r.attempted >= 2).length > 0
        ? (reports
            .filter((r) => r.attempted >= 2)
            .reduce((sum, r) => sum + r.score, 0) / reports.filter((r) => r.attempted >= 2).length)
        : 0;
    const coverage = attemptedQuestions > 0 ? Math.min(100, attemptedQuestions * 2) : 0;
    const masteryShare = attemptedQuestions > 0 ? (mastered / attemptedQuestions) * 100 : 0;
    const readiness = Math.round(0.55 * subjectScore + 0.25 * coverage + 0.2 * masteryShare);
    const label =
      readiness >= 75 ? "strong" : readiness >= 50 ? "moderate" : readiness >= 25 ? "weak" : "fresh";
    const weakest = reports.filter((r) => r.attempted >= 2).sort((a, b) => a.score - b.score)[0];
    return {
      summary: `Readiness ${readiness}% (${label}). Weakest subject: ${weakest?.name ?? "not enough data"}.`,
      data: {
        readiness,
        label,
        subjectScore: Math.round(subjectScore),
        coverage,
        masteryShare: Math.round(masteryShare),
        weakTopics: weak,
        weakestSubject: weakest?.name ?? "",
      },
    };
  },
};
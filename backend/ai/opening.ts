// backend/ai/opening.ts — personalized AI-workspace opening.
//
// Loading = deterministic data assembly in the application layer. The opening
// greeting, summary lines, insights and suggested prompts are all composed
// from REAL evidence (today's plan, due revision, mistake patterns, exam
// countdown, mock average). No LLM involvement, no fabricated numbers, no
// push infrastructure — this runs only when the workspace opens with an empty
// conversation, so per-open freshness is free and spam is impossible.

import "server-only";

import { prisma } from "~backend/db";
import { getMockTestResults, getStudyPlan } from "~backend/services/content";
import { todayBengaliName } from "~backend/services/study-plan";
import { analyzeMistakePatterns } from "./analysis/mistakes";
import type { MistakePatternDto } from "./types";

export type AIOpeningInsight = {
  id: string;
  type: string;
  text: string;
  priority: "high" | "medium" | "low";
};

export type AIOpeningPrompt = {
  id: string;
  labelBn: string;
  prompt: string;
};

export type AIOpening = {
  greeting: string;
  hasHistory: boolean;
  summary: string[];
  insights: AIOpeningInsight[];
  suggestedPrompts: AIOpeningPrompt[];
};

/** Everything the pure composer needs — pre-computed application facts. */
export type OpeningFacts = {
  userName: string;
  hasHistory: boolean;
  studiedToday: boolean;
  tasksTotal: number;
  tasksRemaining: number;
  highPriorityRemaining: number;
  nextExamTitle: string;
  examDaysLeft: number | null;
  flashcardsDue: number;
  mistakeReviewsDue: number;
  recentWrong7d: number;
  previousWrong7d: number;
  mockAverage: number | null;
  mockCount: number;
  patterns: MistakePatternDto[];
  now: Date;
};

const DAY_MS = 86_400_000;
const MAX_SUMMARY = 4;
const MAX_INSIGHTS = 3;
const MAX_PROMPTS = 3;

function timeGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "শুভ সকাল";
  if (h < 16) return "শুভ দুপুর";
  if (h < 19) return "শুভ বিকেল";
  return "শুভ সন্ধ্যা";
}

function buildSummary(facts: OpeningFacts): string[] {
  const out: string[] = [];
  if (!facts.hasHistory) {
    out.push(
      "সিলেবাস এক্সপ্লোর করে প্রথম টপিকটি বেছে নাও — অজানা কিছু নেই, সব টপিকের প্রশ্ন আছে।",
      "ছোট ছোট ধাপে শুরু করাই সেরা: আজকের লক্ষ্য মাত্র একটি টপিক পড়া + ১০টি প্রশ্ন।",
    );
    return out.slice(0, MAX_SUMMARY);
  }

  out.push(
    facts.studiedToday
      ? "আজ পড়াশোনা চলছে — গতি ধরে রাখো।"
      : "আজও পড়া শুরু করো — একটি ছোট ধাপই যথেষ্ট।",
  );
  if (facts.tasksRemaining > 0) {
    out.push(
      `আজকের প্ল্যানে ${facts.tasksRemaining}টি কাজ বাকি${
        facts.highPriorityRemaining > 0 ? ` (এর মধ্যে ${facts.highPriorityRemaining}টি জরুরি)` : ""
      }।`,
    );
  }
  if (facts.flashcardsDue + facts.mistakeReviewsDue > 0) {
    const parts: string[] = [];
    if (facts.flashcardsDue > 0) parts.push(`${facts.flashcardsDue} ফ্ল্যাশকার্ড`);
    if (facts.mistakeReviewsDue > 0) parts.push(`${facts.mistakeReviewsDue} ভুল-রিভিউ`);
    out.push(`রিভিশন ডিউ: ${parts.join(" + ")}।`);
  }
  if (facts.mockCount > 0 && facts.mockAverage !== null) {
    out.push(`সাম্প্রতিক মক গড় ${facts.mockAverage}% (${facts.mockCount}টি)।`);
  }
  return out.slice(0, MAX_SUMMARY);
}

const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

function buildInsights(facts: OpeningFacts): AIOpeningInsight[] {
  const insights: AIOpeningInsight[] = [];
  const push = (i: AIOpeningInsight) => {
    if (!insights.some((x) => x.text === i.text)) insights.push(i);
  };

  if (!facts.hasHistory) return [];

  if (facts.examDaysLeft !== null && facts.examDaysLeft <= 30) {
    push({
      id: "exam-near",
      type: "exam",
      priority: "high",
      text: `পরীক্ষার আর ${facts.examDaysLeft} দিন বাকি — এখন রিভিশন ও মক টেস্টেই ফোকাস রাখো।`,
    });
  }

  if (facts.tasksRemaining > 0 && facts.highPriorityRemaining > 0) {
    push({
      id: "pending-high",
      type: "plan",
      priority: "high",
      text: `আজকের ${facts.highPriorityRemaining}টি জরুরি কাজ এখনো শেষ হয়নি — আগে সেগুলোই সেরে ফেলো।`,
    });
  }

  if (facts.flashcardsDue + facts.mistakeReviewsDue > 0) {
    push({
      id: "revision-due",
      type: "revision",
      priority: "medium",
      text: `${facts.flashcardsDue + facts.mistakeReviewsDue}টি রিভিশন ডিউ — ৫–১০ মিনিটেই সেরে ফেলা যায়।`,
    });
  }

  const repeated = facts.patterns.find(
    (p) => p.pattern === "REPEATED_MISTAKE" && p.count >= 3,
  );
  if (repeated) {
    push({
      id: "repeated-mistake",
      type: "mistake",
      priority: repeated.severity === "high" ? "high" : "medium",
      text: `একই টপিকে বারবার ভুল হচ্ছে${repeated.topic ? ` ("${repeated.topic}")` : ""} — কনসেপ্ট নতুন করে শিখে সেটে প্র্যাকটিস দরকার।`,
    });
  }

  if (facts.mockCount >= 1 && facts.mockAverage !== null && facts.mockAverage < 50) {
    push({
      id: "mock-low",
      type: "mock",
      priority: "medium",
      text: `সাম্প্রতিক মকের গড় (${facts.mockAverage}%) কম — সাপ্তাহিক টার্গেট ঠিক করে মক টেস্ট বাড়াও।`,
    });
  }

  if (facts.recentWrong7d >= 3 && facts.previousWrong7d >= 1 && facts.recentWrong7d > facts.previousWrong7d * 1.5) {
    push({
      id: "regression",
      type: "accuracy",
      priority: "medium",
      text: "গত সপ্তাহের তুলনায় ভুল বেড়েছে — এবার একটু ধীরে ও যত্ন নিয়ে উত্তর দাও।",
    });
  } else if (facts.previousWrong7d >= 2 && facts.recentWrong7d < facts.previousWrong7d) {
    push({
      id: "improvement",
      type: "accuracy",
      priority: "low",
      text: "গত সপ্তাহের তুলনায় ভুল কমেছে — এই ধারা ধরে রাখো!",
    });
  }

  const careless = facts.patterns.find((p) => p.label.includes("অসাবধান"));
  if (careless) {
    push({
      id: "careless",
      type: "mistake",
      priority: "low",
      text: "বেশিরভাগ ভুলই অসাবধানতাজনিত — উত্তর দেওয়ার আগে প্রশ্নটি দুবার পড়ুন।",
    });
  }

  return insights
    .sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority])
    .slice(0, MAX_INSIGHTS);
}

function buildPrompts(facts: OpeningFacts): AIOpeningPrompt[] {
  const out: AIOpeningPrompt[] = [];
  const push = (p: AIOpeningPrompt) => {
    if (!out.some((x) => x.id === p.id)) out.push(p);
  };

  if (!facts.hasHistory) {
    push({
      id: "first-step",
      labelBn: "প্রথম ধাপ",
      prompt: "আমি চাকরির প্রস্তুতি শুরু করছি — কোথা থেকে শুরু করব? প্রথম এক সপ্তাহের পরিকল্পনা দাও।",
    });
    push({ id: "syllabus", labelBn: "সিলেবাস এক্সপ্লোর", prompt: "ভালো করে শুরু করার জন্য সিলেবাসটা গোছানোভাবে দেখাও।" });
    return out.slice(0, MAX_PROMPTS);
  }

  if (facts.tasksRemaining > 0) {
    push({
      id: "today-plan",
      labelBn: "আজকের প্ল্যান চালিয়ে যাও",
      prompt: "আজকের বাকি প্ল্যানটা কীভাবে সাজাই? আমার টাস্কগুলো দেখে পরামর্শ দাও।",
    });
  }
  if (facts.flashcardsDue + facts.mistakeReviewsDue > 0) {
    push({
      id: "revision",
      labelBn: "রিভিশন শুরু করো",
      prompt: "আমার ডিউ ফ্ল্যাশকার্ড ও ভুল-রিভিউগুলো কী কী? কীভাবে সাজাই?",
    });
  }
  if (facts.recentWrong7d >= 2 || facts.patterns.length > 0) {
    push({
      id: "practice",
      labelBn: "দুর্বল টপিকে প্র্যাকটিস",
      prompt: "আমার সাম্প্রতিক ভুলগুলো বিশ্লেষণ করে দুর্বল টপিকগুলোতে প্র্যাকটিস পরামর্শ দাও।",
    });
  }
  if (facts.examDaysLeft !== null && facts.examDaysLeft <= 30) {
    push({
      id: "mock-strategy",
      labelBn: "মক পরীক্ষার কৌশল",
      prompt: "পরীক্ষার জন্য মক পরীক্ষার কৌশল এবং একটি সাপ্তাহিক পরিকল্পনা দাও।",
    });
  }

  return out.slice(0, MAX_PROMPTS);
}

/** Compose the opening payload from application facts (pure + testable). */
export function composeOpening(facts: OpeningFacts): AIOpening {
  const greeting = !facts.hasHistory
    ? `${timeGreeting(facts.now)}! 9Th-Grade AI-এ স্বাগতম।`
    : facts.userName
      ? `${timeGreeting(facts.now)}, ${facts.userName}! ফেরা হয়েছে, ভালো লাগছে।`
      : `${timeGreeting(facts.now)}! ফেরা হয়েছে, ভালো লাগছে।`;

  return {
    greeting,
    hasHistory: facts.hasHistory,
    summary: buildSummary(facts),
    insights: buildInsights(facts),
    suggestedPrompts: buildPrompts(facts),
  };
}

/** Load real facts for a user and compose their opening. */
export async function getAIOpening(userId: string): Promise<AIOpening> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY_MS);

  const [
    user,
    progress,
    aiUsageCount,
    studiedToday,
    taskRows,
    flashcardDueCount,
    mistakeReviewDueCount,
    recentWrong7d,
    previousWrong7d,
    nextExam,
    mockRows,
    mistakeAnalysis,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.userProgress.findUnique({
      where: { userId },
      select: { questionsAnswered: true },
    }),
    prisma.aIUsage.count({ where: { userId } }),
    prisma.questionAttempt.count({
      where: { userId, createdAt: { gte: startOfToday } },
    }),
    getStudyPlan(userId),
    prisma.flashcardUserState.count({ where: { userId, nextReview: { lte: now } } }),
    prisma.userQuestionProgress.count({ where: { userId, nextReviewAt: { lte: now } } }),
    prisma.questionAttempt.count({
      where: { userId, createdAt: { gte: daysAgo(7) }, correct: false },
    }),
    prisma.questionAttempt.count({
      where: {
        userId,
        createdAt: { gte: daysAgo(14), lt: daysAgo(7) },
        correct: false,
      },
    }),
    prisma.examSchedule.findFirst({
      where: { verified: true, date: { gte: now } },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
      select: { titleBn: true, date: true },
    }),
    getMockTestResults(userId),
    analyzeMistakePatterns(userId),
  ]);

  const answered = progress?.questionsAnswered ?? 0;
  const hasHistory = answered > 0 || aiUsageCount > 0;

  const today = todayBengaliName(now);
  const todays = taskRows.filter((t) => t.day === today);
  const remaining = todays.filter((t) => !t.completed);

  const mockScored = mockRows.filter((r) => r.total > 0).slice(0, 5);
  const mockAverage =
    mockScored.length > 0
      ? Math.round((mockScored.reduce((s, r) => s + r.score, 0) / mockScored.length) * 10) / 10
      : null;

  return composeOpening({
    userName: user?.name ?? "",
    hasHistory,
    studiedToday: studiedToday > 0,
    tasksTotal: todays.length,
    tasksRemaining: remaining.length,
    highPriorityRemaining: remaining.filter((t) => t.priority === "high").length,
    nextExamTitle: nextExam?.titleBn ?? "",
    examDaysLeft: nextExam
      ? Math.max(0, Math.ceil((nextExam.date.getTime() - now.getTime()) / DAY_MS))
      : null,
    flashcardsDue: flashcardDueCount,
    mistakeReviewsDue: mistakeReviewDueCount,
    recentWrong7d,
    previousWrong7d,
    mockAverage,
    mockCount: mockScored.length,
    patterns: mistakeAnalysis.patterns,
    now,
  });
}
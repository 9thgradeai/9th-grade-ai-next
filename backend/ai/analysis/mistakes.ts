// backend/ai/analysis/mistakes.ts — deterministic mistake-pattern analysis.
//
// Classification lives in the APPLICATION layer: we read the learner's real
// wrong-answer evidence (topic, classified error type, recency) and derive
// patterns with explicit minimum-evidence thresholds. The model only ever
// interprets the resulting patterns — it never labels the learner from a
// single isolated mistake.
//
// Thresholds (app-owned, stable):
//   - zero patterns below 3 recent wrong answers (insufficient evidence)
//   - topic pattern only when >= 3 wrong on the same topic in the window
//   - error-type patterns only when count >= 3 (memory failures >= 2)

import "server-only";

import { prisma } from "~backend/db";
import type { MistakePatternDto } from "../types";

export type MistakeRow = {
  questionId?: number | null;
  subjectName: string;
  topic: string;
  errorType: string | null;
  durationSec: number;
  createdAt: Date;
};

const DAY_MS = 86_400_000;
const WINDOW_MS = 30 * DAY_MS;

const MIN_WRONG_EVIDENCE = 3;
const MIN_TOPIC_REPEATS = 3;
const MIN_TYPE_COUNT = 3;
const MIN_MEMORY_COUNT = 2;
const MIN_SHARE = 0.25;
const MAX_PATTERNS = 4;

const TYPE_LABELS: Record<string, string> = {
  CARELESS_MISTAKE: "অসাবধানতাজনিত ভুল",
  GUESSING: "অনুমান করে উত্তর",
  MEMORY_FAILURE: "ভুলে যাওয়া",
  TIME_PRESSURE: "সময়ের চাপে ভুল",
  CONCEPTUAL_GAP: "ধারণাগত দুর্বলতা",
  CALCULATION_ERROR: "হিসাবের ভুল",
  MISREADING: "প্রশ্ন না-বোঝা",
};

/** Build mistake patterns from raw wrong-attempt evidence (pure + testable). */
export function buildMistakePatterns(
  rows: MistakeRow[],
  opts?: { max?: number },
): MistakePatternDto[] {
  const max = opts?.max ?? MAX_PATTERNS;
  if (rows.length < MIN_WRONG_EVIDENCE) return [];

  const patterns: MistakePatternDto[] = [];

  // 1. Repeated same-topic errors → a recurring concept-level gap.
  const byTopic = new Map<string, { count: number; subject: string }>();
  for (const r of rows) {
    const topic = r.topic || r.subjectName || "অন্যান্য";
    const entry = byTopic.get(topic) ?? { count: 0, subject: r.subjectName };
    entry.count += 1;
    byTopic.set(topic, entry);
  }
  for (const [topic, { count, subject }] of byTopic) {
    if (count < MIN_TOPIC_REPEATS) continue;
    patterns.push({
      pattern: "REPEATED_MISTAKE",
      label: "একই টপিকে বারবার ভুল",
      severity: count >= 5 ? "high" : "medium",
      topic,
      count,
      detail: `গত ৩০ দিনে "${topic}" টপিকে ${count} বার ভুল উত্তর (${subject || "অন্যান্য"})।`,
      advice:
        "টপিকটি নতুন করে পড়ুন, মূল নিয়ম/কৌশলটি নিজের ভাষায় লিখে ফেলুন, তারপর একই টাইপের অন্তত ৫টি প্রশ্ন প্র্যাকটিস করুন।",
    });
  }

  // 2. Error-type patterns (classifier labels, when present).
  const total = rows.length;
  const byType = new Map<string, number>();
  for (const r of rows) {
    if (r.errorType) byType.set(r.errorType, (byType.get(r.errorType) ?? 0) + 1);
  }

  const typeOrder = [
    "CARELESS_MISTAKE",
    "GUESSING",
    "MEMORY_FAILURE",
    "TIME_PRESSURE",
    "CONCEPTUAL_GAP",
    "CALCULATION_ERROR",
    "MISREADING",
  ];
  const minimum = (type: string) => (type === "MEMORY_FAILURE" ? MIN_MEMORY_COUNT : MIN_TYPE_COUNT);
  const adviceFor = (type: string): string => {
    switch (type) {
      case "CARELESS_MISTAKE":
        return "উত্তর দেওয়ার আগে প্রশ্নটি দুবার পড়ুন ও হিসাবটি খাতায় মেলান; দ্রুততার চেয়ে নিশ্চিত হওয়াই বেশি স্পেশালব্যাপী গুরুত্বপূর্ণ।";
      case "GUESSING":
        return "অজানা প্রশ্নে অনুমান নয় — বর্জন পদ্ধতি (elimination) ব্যবহার করুন এবং বাজে সময় গুনলে প্রশ্নটি ছেড়ে দিন।";
      case "MEMORY_FAILURE":
        return "একবার জানা ছিল এমন বিষয় ভুলে যাওয়া — স্পেসড রিপিটিশন (ফ্ল্যাশকার্ড/রিভিশন) এর মাধ্যমে দ্রুত পর্যালোচনা করলেই ঠিক হবে।";
      case "TIME_PRESSURE":
        return "মক টেস্টে সময় ভাগাভাগি করুন; কঠিন প্রশ্ন চিহ্নিত করে পরে ফিরে আসুন।";
      case "CONCEPTUAL_GAP":
        return "বিষয়টির কনসেপ্ট অগোছালো — নতুন করে শিখুন, তারপর সমস্যাটির ধাপে ধাপে সমাধান প্র্যাকটিস করুন।";
      case "CALCULATION_ERROR":
        return "হিসাব শেষে কয়েক সেকেন্ড রিভার্স-চেক করুন (উল্টোভাবে যাচাই)।";
      case "MISREADING":
        return "কী জিজ্ঞেস করছে তা নোট করুন (যেমন 'কোনটি নয়'); অপশনগুলো পড়ে নিশ্চিত হয়ে উত্তর দিন।";
      default:
        return "ভুলের ধরন পরিষ্কার নয় — আরও কিছু প্রশ্ন প্র্যাকটিস করে বারবার-ভুল টপিক ট্র্যাক করুন।";
    }
  };

  for (const type of typeOrder) {
    const count = byType.get(type) ?? 0;
    const share = count / total;
    if (count < minimum(type)) continue;
    if (share < MIN_SHARE && count < MIN_TYPE_COUNT + 2) continue;
    patterns.push({
      pattern: "ERROR_TYPE",
      label: TYPE_LABELS[type] ?? type,
      severity: count >= 5 ? "medium" : "low",
      count,
      detail: `গত ৩০ দিনে ${count}টি ভুল (${
        total
      }টির মধ্যে) "${TYPE_LABELS[type] ?? type}" ধরনের।`,
      advice: adviceFor(type),
    });
  }

  // 3. De-duplicate: skip a redundant CONCEPTUAL_GAP type pattern if the same
  //    concern is already covered by a topic-level repeated-mistake pattern.
  const hasTopicPattern = patterns.some((p) => p.pattern === "REPEATED_MISTAKE");
  const filtered = patterns.filter(
    (p) => !(p.pattern === "ERROR_TYPE" && p.count <= MIN_TYPE_COUNT && hasTopicPattern),
  );

  return filtered
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

/**
 * Load a learner's recent wrong answers and derive patterns.
 * Returns the derived patterns plus the recent wrong count for context.
 */
export async function analyzeMistakePatterns(
  userId: string,
): Promise<{ patterns: MistakePatternDto[]; recentWrongCount: number }> {
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await prisma.questionAttempt.findMany({
    where: { userId, createdAt: { gte: since }, correct: false },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      questionId: true,
      subjectName: true,
      topic: true,
      createdAt: true,
    },
  });
  const patterns = buildMistakePatterns(rows.map((r) => ({ ...r, errorType: null, durationSec: 0 })));
  return { patterns, recentWrongCount: rows.length };
}
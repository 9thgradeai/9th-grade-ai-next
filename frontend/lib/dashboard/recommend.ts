// Derives a single, decision-driving "Next Best Action" from real user state.
// No fabricated personalization — every branch is backed by data the dashboard
// already fetches (weakness, exam date, streak, mistake count, today's activity).

import type { TabId } from "@/lib/data";

export type NextAction = {
  id: string;
  title: string;
  description: string;
  cta: string;
  tab: TabId;
  intensity: "high" | "medium" | "low";
};

export type RecommendInput = {
  weakest?: { name: string; score: number; attempted: number } | null;
  examTitle?: string | null;
  examDaysLeft?: number | null;
  streak?: number;
  studiedToday?: boolean;
  pendingMistakes?: number;
};

export function deriveNextAction(input: RecommendInput): NextAction {
  const {
    weakest,
    examTitle,
    examDaysLeft,
    streak = 0,
    studiedToday = false,
    pendingMistakes = 0,
  } = input;

  // 1. Exam is near AND a weak subject exists → revise the weak subject first.
  if (
    examTitle &&
    examDaysLeft != null &&
    examDaysLeft >= 0 &&
    examDaysLeft <= 30 &&
    weakest &&
    weakest.attempted > 0
  ) {
    return {
      id: "revise-before-exam",
      title: `${weakest.name} রিভিশন করুন`,
      description: `${examTitle} এর মাত্র ${examDaysLeft} দিন বাকি — দুর্বল বিষয় ${weakest.name} (${weakest.score}%) এখন পড়ুন।`,
      cta: "অভ্যাস শুরু করুন",
      tab: "practice",
      intensity: "high",
    };
  }

  // 2. A genuinely weak subject (enough attempts to be confident) → practice it.
  if (weakest && weakest.attempted >= 3 && weakest.score < 60) {
    return {
      id: "practice-weak",
      title: `${weakest.name} অভ্যাস করুন`,
      description: `এই বিষয়ে আপনার সঠিকতা ${weakest.score}% — প্র্যাকটিস করে তা বাড়ান।`,
      cta: "প্র্যাকটিস করুন",
      tab: "practice",
      intensity: "high",
    };
  }

  // 3. Unreviewed mistakes → review them (highest learning leverage).
  if (pendingMistakes > 0) {
    return {
      id: "review-mistakes",
      title: `${pendingMistakes}টি ভুল পর্যালোচনা করুন`,
      description: "ভুল করা প্রশ্ন বুঝে নিলে একই ভুল আর হবে না।",
      cta: "ভুলের নোট দেখুন",
      tab: "wrong-answers",
      intensity: "medium",
    };
  }

  // 4. Hasn't studied today → a short warm-up protects the streak.
  if (!studiedToday) {
    return {
      id: "daily-warmup",
      title: "আজকের ওয়ার্ম-আপ করুন",
      description:
        streak > 0
          ? `স্ট্রিক ${streak} দিন ধরে রাখতে ১০টি প্রশ্ন সমাধান করুন।`
          : "আজ ১০টি প্রশ্ন সমাধান করে শুরু করুন।",
      cta: "প্র্যাকটিস শুরু করুন",
      tab: "practice",
      intensity: "medium",
    };
  }

  // 5. Default → keep the momentum with more practice.
  return {
    id: "keep-going",
    title: "প্র্যাকটিস চালিয়ে যান",
    description: "নিয়মিত অভ্যাসই পরীক্ষায় ভালো করার চাবিকাঠি।",
    cta: "প্র্যাকটিস করুন",
    tab: "practice",
    intensity: "low",
  };
}

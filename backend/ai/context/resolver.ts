// Context resolver — decides which live data slices a task's intent needs.
// Pure and deterministic so it is unit-testable without a database. The rule:
// load ONLY what the current task needs (no weight on teaching turns, rich
// data on planning / performance / revision / exam turns).

import type { AIIntent, ContextSliceKey } from "../types";

export type ContextPlan = {
  slices: ContextSliceKey[];
  /**
   * The dominant context theme for this task, used to tune which slice
   * descriptions the model sees first.
   */
  focus: AIIntent | "general";
};

// Revision / review tasks need the due-slices (flashcards + mistake reviews).
const REVISION_SLICES: ContextSliceKey[] = ["revision", "todayPlan"];

// Planning / "what should I do" tasks ground on today's plan + the exam.
const PLAN_SLICES: ContextSliceKey[] = ["todayPlan", "exam"];

// Performance analysis grounds on mistakes + exam pressure + mock history.
const ANALYSIS_SLICES: ContextSliceKey[] = [
  "mistakes",
  "exam",
  "mockPerformance",
];

// Exam-strategy tasks reason about the exam date, recent mocks and revision load.
const STRATEGY_SLICES: ContextSliceKey[] = [
  "exam",
  "mockPerformance",
  "revision",
];

// Home-brief turns ("what should I do right now?") ground on the full
// at-a-glance state: today's plan, exam pressure, mistake load, revision
// backlog and recent mock form.
const HOME_BRIEF_SLICES: ContextSliceKey[] = [
  "todayPlan",
  "exam",
  "mistakes",
  "revision",
  "mockPerformance",
];

const PLAN: Record<AIIntent | "general", ContextPlan> = {
  tutor: { slices: [], focus: "tutor" },
  solve: { slices: [], focus: "solve" },
  explain: { slices: [], focus: "explain" },
  hint: { slices: [], focus: "hint" },
  quiz: { slices: ["mistakes"], focus: "quiz" },
  revise: { slices: REVISION_SLICES, focus: "revise" },
  summarize: { slices: [], focus: "summarize" },
  plan: { slices: PLAN_SLICES, focus: "plan" },
  analyze_performance: { slices: ANALYSIS_SLICES, focus: "analyze_performance" },
  recommend: { slices: ANALYSIS_SLICES, focus: "recommend" },
  question_generation: { slices: [], focus: "question_generation" },
  current_affairs: { slices: [], focus: "current_affairs" },
  general: { slices: [], focus: "general" },
  practice: { slices: ["mistakes", "mockPerformance"], focus: "practice" },
  mock_exam: { slices: ["mockPerformance", "exam", "mistakes"], focus: "mock_exam" },
  exam_strategy: { slices: STRATEGY_SLICES, focus: "exam_strategy" },
  career: { slices: ["exam"], focus: "career" },
  navigation: { slices: [], focus: "navigation" },
  home_brief: { slices: HOME_BRIEF_SLICES, focus: "home_brief" },
};

/** Resolve the slice plan for an intent. Unknown/absent → light plan. */
export function resolveContextPlan(intent: AIIntent | undefined): ContextPlan {
  if (intent && intent in PLAN) return PLAN[intent];
  return PLAN.general;
}
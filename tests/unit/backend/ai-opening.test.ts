// Unit tests for the AI Study Copilot application-layer pieces: context slice
// planning, mistake-pattern analysis, opening composition, and slice rendering.
// All pure functions — no database, no provider.

import { describe, it, expect } from "vitest";
import { resolveContextPlan } from "~backend/ai/context/resolver";
import { renderSlicesForPrompt } from "~backend/ai/context/render";
import { buildMistakePatterns, type MistakeRow } from "~backend/ai/analysis/mistakes";
import { composeOpening, type OpeningFacts } from "~backend/ai/opening";

describe("resolveContextPlan", () => {
  it("maps revision intents to revision + today-plan slices", () => {
    expect(resolveContextPlan("revise").slices).toEqual(["revision", "todayPlan"]);
  });

  it("maps planning intents to today-plan + exam slices", () => {
    expect(resolveContextPlan("plan").slices).toEqual(["todayPlan", "exam"]);
  });

  it("maps performance intents to mistakes + exam + mock performance", () => {
    expect(resolveContextPlan("analyze_performance").slices).toContain("mistakes");
    expect(resolveContextPlan("recommend").slices).toEqual([
      "mistakes",
      "exam",
      "mockPerformance",
    ]);
  });

  it("maps exam-strategy and practice intents to high-signal slices", () => {
    expect(resolveContextPlan("exam_strategy").slices).toEqual([
      "exam",
      "mockPerformance",
      "revision",
    ]);
    expect(resolveContextPlan("practice").slices).toEqual(["mistakes", "mockPerformance"]);
    expect(resolveContextPlan("mock_exam").slices).toContain("mockPerformance");
  });

  it("keeps teaching intents light", () => {
    expect(resolveContextPlan("tutor").slices).toEqual([]);
    expect(resolveContextPlan("solve").slices).toEqual([]);
    expect(resolveContextPlan(undefined).slices).toEqual([]);
  });

  it("grounds home-brief turns on the full at-a-glance state", () => {
    const plan = resolveContextPlan("home_brief");
    expect(plan.focus).toBe("home_brief");
    expect(plan.slices).toEqual(["todayPlan", "exam", "mistakes", "revision", "mockPerformance"]);
  });
});

describe("renderSlicesForPrompt", () => {
  it("renders an empty string for absent slices", () => {
    expect(renderSlicesForPrompt(undefined)).toBe("");
    expect(renderSlicesForPrompt({})).toBe("");
  });

  it("renders the live snapshot heading with plan + revision data", () => {
    const out = renderSlicesForPrompt({
      todayPlan: {
        total: 5,
        remaining: 2,
        highPriorityRemaining: 1,
        firstTitle: "বাংলা ব্যাকরণ",
        dayName: "রবিবার",
      },
      revision: { flashcardsDue: 3, mistakeReviewsDue: 0 },
    });
    expect(out).toContain("## Live preparation snapshot");
    expect(out).toContain("2 of 5 tasks remaining");
    expect(out).toContain("3 flashcards");
  });

  it("renders exam + mock + mistake pattern lines when present", () => {
    const out = renderSlicesForPrompt({
      exam: { nextExam: { titleBn: "৫ম বেসরকারি শিক্ষক নিবন্ধন", titleEn: "", type: "TEACHER", date: "2026-01-01" }, daysLeft: 30 },
      mockPerformance: { average: 42, count: 4 },
      mistakes: {
        patterns: [
          {
            pattern: "REPEATED_MISTAKE",
            label: "একই টপিকে বারবার ভুল",
            severity: "medium",
            topic: "সন্ধি",
            count: 4,
            detail: "detail",
            advice: "advice",
          },
        ],
        recentWrongCount: 12,
      },
    });
    expect(out).toContain("৫ম বেসরকারি শিক্ষক নিবন্ধন");
    expect(out).toContain("in 30 days");
    expect(out).toContain("Recent mock average: 42%");
    expect(out).toContain("বারবার ভুল");
  });
});

describe("buildMistakePatterns", () => {
  const row = (over: Partial<MistakeRow>): MistakeRow => ({
    questionId: null,
    subjectName: "বাংলা",
    topic: "সন্ধি",
    errorType: null,
    durationSec: 30,
    createdAt: new Date(),
    ...over,
  });

  it("returns no patterns below the minimum wrong-answer evidence", () => {
    expect(buildMistakePatterns([row({}), row({})])).toEqual([]);
  });

  it("detects repeated same-topic mistakes at the topic threshold", () => {
    const rows = [row({}), row({ topic: "সন্ধি" }), row({ topic: "সন্ধি" })];
    const patterns = buildMistakePatterns(rows);
    expect(patterns.some((p) => p.pattern === "REPEATED_MISTAKE" && p.topic === "সন্ধি")).toBe(true);
  });

  it("detects documented careless-mistake patterns with advice", () => {
    const rows = [
      row({ errorType: "CARELESS_MISTAKE", topic: "a" }),
      row({ errorType: "CARELESS_MISTAKE", topic: "b" }),
      row({ errorType: "CARELESS_MISTAKE", topic: "c" }),
    ];
    const patterns = buildMistakePatterns(rows);
    expect(patterns.some((p) => p.pattern === "ERROR_TYPE" && p.label.includes("অসাবধান"))).toBe(true);
  });

  it("caps patterns at the configured max and sorts by count", () => {
    const rows: MistakeRow[] = [];
    for (let i = 0; i < 9; i++) rows.push(row({ topic: `t${i}` }));
    const patterns = buildMistakePatterns(rows, { max: 2 });
    expect(patterns.length).toBeLessThanOrEqual(2);
  });
});

describe("composeOpening", () => {
  const facts: OpeningFacts = {
    userName: "রাকিব",
    hasHistory: true,
    studiedToday: true,
    tasksTotal: 5,
    tasksRemaining: 2,
    highPriorityRemaining: 1,
    nextExamTitle: "৫ম বেসরকারি শিক্ষক নিবন্ধন",
    examDaysLeft: 21,
    flashcardsDue: 4,
    mistakeReviewsDue: 0,
    recentWrong7d: 6,
    previousWrong7d: 9,
    mockAverage: 42,
    mockCount: 4,
    patterns: [
      {
        pattern: "REPEATED_MISTAKE",
        label: "একই টপিকে বারবার ভুল",
        severity: "high",
        topic: "সন্ধি",
        count: 5,
        detail: "detail",
        advice: "advice",
      },
    ],
    now: new Date(2026, 1, 10, 10, 30),
  };

  it("greets with the learner's name and time-of-day prefix", () => {
    const opening = composeOpening(facts);
    expect(opening.greeting).toMatch(/রাকিব/);
    expect(opening.greeting).toMatch(/শুভ|শুভরাত্রি/);
  });

  it("summarizes remaining tasks and revision without inventing numbers", () => {
    const opening = composeOpening(facts);
    const all = opening.summary.join("\n");
    expect(all).toContain("2টি");
    expect(all).toContain("রিভিশন");
    expect(all.includes("ফ্ল্যাশকার্ড")).toBe(true);
  });

  it("surfaces high-priority insights (exam close, revision due, mock low)", () => {
    const opening = composeOpening(facts);
    expect(opening.insights.length).toBeGreaterThan(0);
    expect(opening.insights[0].priority).toBe("high");
  });

  it("limits insights and prompts to their maxes", () => {
    const opening = composeOpening(facts);
    expect(opening.insights.length).toBeLessThanOrEqual(3);
    expect(opening.suggestedPrompts.length).toBeLessThanOrEqual(3);
  });

  it("guides new users toward a first step", () => {
    const opening = composeOpening({ ...facts, hasHistory: false, questionsAnswered: 0 });
    expect(opening.summary.length).toBeGreaterThan(0);
  });
});
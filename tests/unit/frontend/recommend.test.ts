import { describe, it, expect } from "vitest";
import { deriveNextAction } from "@/lib/dashboard/recommend";

const weak = { name: "English", score: 45, attempted: 12 };

describe("deriveNextAction", () => {
  it("urges revising the weak subject before a near exam", () => {
    const a = deriveNextAction({
      weakest: weak,
      examTitle: "BCS প্রিলিমিনারি",
      examDaysLeft: 18,
      studiedToday: true,
      pendingMistakes: 0,
    });
    expect(a.id).toBe("revise-before-exam");
    expect(a.tab).toBe("practice");
    expect(a.intensity).toBe("high");
  });

  it("prioritises practising a genuinely weak subject (>=3 attempts, <60%)", () => {
    const a = deriveNextAction({
      weakest: weak,
      examTitle: null,
      examDaysLeft: null,
      studiedToday: true,
      pendingMistakes: 0,
    });
    expect(a.id).toBe("practice-weak");
  });

  it("does not flag a strong subject as weak", () => {
    const a = deriveNextAction({
      weakest: { name: "Math", score: 82, attempted: 20 },
      examTitle: null,
      examDaysLeft: null,
      studiedToday: true,
      pendingMistakes: 0,
    });
    expect(a.id).not.toBe("practice-weak");
  });

  it("reviews pending mistakes when none of the above applies", () => {
    const a = deriveNextAction({
      weakest: null,
      examTitle: null,
      examDaysLeft: null,
      studiedToday: true,
      pendingMistakes: 7,
    });
    expect(a.id).toBe("review-mistakes");
    expect(a.tab).toBe("mistakes");
  });

  it("prompts a warm-up when nothing has been studied today", () => {
    const a = deriveNextAction({
      weakest: null,
      examTitle: null,
      examDaysLeft: null,
      studiedToday: false,
      pendingMistakes: 0,
      streak: 0,
    });
    expect(a.id).toBe("daily-warmup");
    expect(a.cta).toMatch(/প্র্যাকটিস/);
  });

  it("falls back to keeping momentum once today is covered", () => {
    const a = deriveNextAction({
      weakest: null,
      examTitle: null,
      examDaysLeft: null,
      studiedToday: true,
      pendingMistakes: 0,
    });
    expect(a.id).toBe("keep-going");
  });

  it("never invents a tab that is not in the navigation set", () => {
    const valid = new Set([
      "home",
      "study-planner",
      "practice",
      "flashcards",
      "ai-solver",
      "question-bank",
      "progress",
      "wrong-answers",
      "settings",
    ]);
    const a = deriveNextAction({
      weakest: weak,
      examTitle: "BCS",
      examDaysLeft: 5,
      studiedToday: false,
      pendingMistakes: 3,
    });
    expect(valid.has(a.tab)).toBe(true);
  });
});

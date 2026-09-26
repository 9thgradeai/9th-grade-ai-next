import { describe, it, expect } from "vitest";
import { EMPTY_INTELLIGENCE, mergeIntelligence } from "@/lib/intelligence";

describe("EMPTY_INTELLIGENCE", () => {
  it("covers every key of the full DTO with honest zeros", () => {
    expect(EMPTY_INTELLIGENCE.overall.totalAttempts).toBe(0);
    expect(EMPTY_INTELLIGENCE.activity).toEqual([]);
    expect(EMPTY_INTELLIGENCE.streak).toBe(0);
    expect(EMPTY_INTELLIGENCE.nextExam).toBeNull();
    expect(EMPTY_INTELLIGENCE.studyTasks).toEqual([]);
    expect(EMPTY_INTELLIGENCE.recommendations).toEqual([]);
    expect(EMPTY_INTELLIGENCE.dailyQuizAvailable).toBe(false);
    expect(EMPTY_INTELLIGENCE.mistakes.bySubject).toEqual([]);
  });
});

describe("mergeIntelligence", () => {
  it("layers a pulse patch over the empty baseline", () => {
    const merged = mergeIntelligence(EMPTY_INTELLIGENCE, { streak: 5, flashcardsDue: 3 });
    expect(merged.streak).toBe(5);
    expect(merged.flashcardsDue).toBe(3);
    // Untouched scopes keep honest zeros.
    expect(merged.studyTasks).toEqual([]);
    expect(merged.recommendations).toEqual([]);
  });

  it("accumulates successive scopes without clobbering earlier ones", () => {
    const afterPulse = mergeIntelligence(EMPTY_INTELLIGENCE, { streak: 5 });
    const afterTasks = mergeIntelligence(afterPulse, { studyTasks: [] });
    const afterAnalytics = mergeIntelligence(afterTasks, { recommendations: [] });
    expect(afterAnalytics.streak).toBe(5);
    expect(afterAnalytics.studyTasks).toEqual([]);
    expect(afterAnalytics.recommendations).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const patch = { streak: 9 };
    mergeIntelligence(EMPTY_INTELLIGENCE, patch);
    expect(EMPTY_INTELLIGENCE.streak).toBe(0);
  });
});

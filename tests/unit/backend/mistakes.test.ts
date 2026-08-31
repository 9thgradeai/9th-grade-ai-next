import { describe, it, expect } from "vitest";
import {
  computeMasteryStatus,
  computeMasteryScore,
  isStillAMistake,
  computeReviewInterval,
  computeMistakePriorityScore,
  allocateMistakesAcrossSubjects,
  MASTERY_THRESHOLDS,
} from "~backend/services/mastery";

describe("mastery: wrong-answer recording", () => {
  it("creates STRUGGLING status on first incorrect attempt", () => {
    expect(computeMasteryStatus("NEW", false, 0)).toBe("STRUGGLING");
  });

  it("stays NEW on first correct attempt", () => {
    expect(computeMasteryStatus("NEW", true, 1)).toBe("NEW");
  });

  it("stays STRUGGLING after incorrect", () => {
    expect(computeMasteryStatus("STRUGGLING", false, 0)).toBe("STRUGGLING");
  });

  it("moves STRUGGLING → REVIEWING after first correct", () => {
    expect(computeMasteryStatus("STRUGGLING", true, 1)).toBe("REVIEWING");
  });

  it("moves REVIEWING → IMPROVING after 2 consecutive correct", () => {
    expect(computeMasteryStatus("REVIEWING", true, 2)).toBe("IMPROVING");
  });

  it("moves IMPROVING → MASTERED after 3 consecutive correct", () => {
    expect(computeMasteryStatus("IMPROVING", true, 3)).toBe("MASTERED");
  });

  it("stays MASTERED on further correct", () => {
    expect(computeMasteryStatus("MASTERED", true, 4)).toBe("MASTERED");
  });

  it("regresses MASTERED → STRUGGLING on incorrect", () => {
    expect(computeMasteryStatus("MASTERED", false, 0)).toBe("STRUGGLING");
  });

  it("regresses IMPROVING → STRUGGLING on incorrect", () => {
    expect(computeMasteryStatus("IMPROVING", false, 0)).toBe("STRUGGLING");
  });
});

describe("mastery: mastery score", () => {
  it("increments on correct", () => {
    expect(computeMasteryScore(50, true)).toBe(65);
  });

  it("decrements on incorrect", () => {
    expect(computeMasteryScore(50, false)).toBe(25);
  });

  it("clamps at 0", () => {
    expect(computeMasteryScore(10, false)).toBe(0);
  });

  it("clamps at 100", () => {
    expect(computeMasteryScore(95, true)).toBe(100);
  });
});

describe("mistake: isStillAMistake", () => {
  it("returns false with no incorrect attempts", () => {
    expect(isStillAMistake("NEW", 0)).toBe(false);
  });

  it("keeps question as mistake while struggling", () => {
    expect(isStillAMistake("STRUGGLING", 5)).toBe(true);
  });

  it("keeps question as mistake while reviewing", () => {
    expect(isStillAMistake("REVIEWING", 3)).toBe(true);
  });

  it("keeps question as mistake while improving", () => {
    expect(isStillAMistake("IMPROVING", 2)).toBe(true);
  });

  it("no longer a mistake once mastered", () => {
    expect(isStillAMistake("MASTERED", 2)).toBe(false);
  });
});

describe("mistake: review intervals", () => {
  it("returns 4h for first mistake", () => {
    expect(computeReviewInterval(1, "STRUGGLING")).toBe(4);
  });

  it("returns 12h for second mistake", () => {
    expect(computeReviewInterval(2, "STRUGGLING")).toBe(12);
  });

  it("returns 24h for third mistake", () => {
    expect(computeReviewInterval(3, "STRUGGLING")).toBe(24);
  });

  it("returns 48h for repeated mistakes", () => {
    expect(computeReviewInterval(5, "STRUGGLING")).toBe(48);
  });

  it("returns 72h for mastered", () => {
    expect(computeReviewInterval(2, "MASTERED")).toBe(72);
  });
});

describe("mistake: threshold configurability", () => {
  it("exposes configurable thresholds", () => {
    expect(MASTERY_THRESHOLDS.reviewAfterCorrect).toBe(1);
    expect(MASTERY_THRESHOLDS.improvingAfterCorrect).toBe(2);
    expect(MASTERY_THRESHOLDS.masteredAfterCorrect).toBe(3);
  });
});

describe("mistake: priority scoring", () => {
  const base = {
    mistakeCount: 1,
    lastIncorrectAt: null,
    masteryScore: 50,
    nextReviewAt: null,
    difficulty: "MEDIUM" as const,
    totalAttempts: 1,
  };

  it("scores frequent mistakes higher", () => {
    const low = computeMistakePriorityScore({ ...base, mistakeCount: 1 });
    const high = computeMistakePriorityScore({ ...base, mistakeCount: 5 });
    expect(high).toBeGreaterThan(low);
  });

  it("scores recent mistakes higher", () => {
    const now = new Date();
    const recent = computeMistakePriorityScore({
      ...base,
      lastIncorrectAt: new Date(now.getTime() - 1000 * 60 * 30),
      now,
    });
    const old = computeMistakePriorityScore({
      ...base,
      lastIncorrectAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30),
      now,
    });
    expect(recent).toBeGreaterThan(old);
  });

  it("scores low-mastery mistakes higher", () => {
    const low = computeMistakePriorityScore({ ...base, masteryScore: 0 });
    const high = computeMistakePriorityScore({ ...base, masteryScore: 90 });
    expect(low).toBeGreaterThan(high);
  });

  it("scores due-for-review mistakes higher", () => {
    const now = new Date();
    const due = computeMistakePriorityScore({
      ...base,
      nextReviewAt: new Date(now.getTime() - 1000),
      now,
    });
    const notDue = computeMistakePriorityScore({
      ...base,
      nextReviewAt: new Date(now.getTime() + 1000 * 60 * 60),
      now,
    });
    expect(due).toBeGreaterThan(notDue);
  });

  it("scores hard questions higher than easy", () => {
    const easy = computeMistakePriorityScore({ ...base, difficulty: "EASY" });
    const hard = computeMistakePriorityScore({ ...base, difficulty: "HARD" });
    expect(hard).toBeGreaterThan(easy);
  });

  it("is deterministic for same inputs", () => {
    const a = computeMistakePriorityScore(base);
    const b = computeMistakePriorityScore(base);
    expect(a).toBe(b);
  });
});

describe("mistake: cross-subject allocation", () => {
  it("allocates all count to single subject", () => {
    const result = allocateMistakesAcrossSubjects(20, [{ subject: "Math", count: 25 }]);
    expect(result).toEqual([{ subject: "Math", allocated: 20 }]);
  });

  it("allocates proportionally across subjects", () => {
    const result = allocateMistakesAcrossSubjects(20, [
      { subject: "Math", count: 10 },
      { subject: "English", count: 5 },
      { subject: "Bangla", count: 5 },
    ]);
    const total = result.reduce((acc, r) => acc + r.allocated, 0);
    expect(total).toBe(20);
    // Math has the most mistakes → gets the most questions
    const math = result.find((r) => r.subject === "Math");
    const english = result.find((r) => r.subject === "English");
    expect(math!.allocated).toBeGreaterThanOrEqual(english!.allocated);
  });

  it("handles empty subjects", () => {
    expect(allocateMistakesAcrossSubjects(20, [])).toEqual([]);
  });

  it("does not exceed per-subject count", () => {
    const result = allocateMistakesAcrossSubjects(50, [
      { subject: "Math", count: 10 },
      { subject: "English", count: 5 },
    ]);
    const math = result.find((r) => r.subject === "Math");
    expect(math!.allocated).toBeLessThanOrEqual(10);
  });
});

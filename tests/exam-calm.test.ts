import { describe, expect, it } from "vitest";
import { calmTimerLevel, formatClock, paletteStates, wrappedLine } from "@/lib/exam-calm";

describe("exam calm engine (Phase 3)", () => {
  it("grades timer calm levels", () => {
    expect(calmTimerLevel(1200)).toBe("normal");
    expect(calmTimerLevel(200)).toBe("low");
    expect(calmTimerLevel(60)).toBe("critical");
    expect(calmTimerLevel(0)).toBe("critical");
  });

  it("formats clock without layout shift", () => {
    expect(formatClock(90)).toBe("1:30");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("tracks palette states for backtracking", () => {
    const states = paletteStates([1, 2, 3], { 1: "A" }, 2);
    expect(states).toEqual(["answered", "current", "unseen"]);
  });

  it("builds a shareable wrapped line", () => {
    expect(wrappedLine(8, 10, 7)).toContain("8/10");
  });
});

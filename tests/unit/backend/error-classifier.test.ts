import { describe, it, expect } from "vitest";
import {
  classifyErrorType,
  parseErrorType,
  ERROR_TYPE_LABELS,
} from "~backend/services/error-classifier";

describe("error-classifier (§2 deterministic wrong-answer classification)", () => {
  it("returns null for correct answers regardless of evidence", () => {
    expect(
      classifyErrorType({
        isCorrect: true,
        difficulty: "EASY",
        durationSec: 1,
        previous: { masteryStatus: "MASTERED", consecutiveIncorrect: 5, mistakeCount: 9 },
      }),
    ).toBeNull();
  });

  it("classifies a previously-mastered question as MEMORY_FAILURE (highest priority)", () => {
    expect(
      classifyErrorType({
        isCorrect: false,
        difficulty: "EASY",
        durationSec: 2, // also fast — but MASTERED rule wins
        previous: { masteryStatus: "MASTERED" },
      }),
    ).toBe("MEMORY_FAILURE");
  });

  it("classifies an implausibly-fast wrong answer as GUESSING", () => {
    expect(
      classifyErrorType({
        isCorrect: false,
        difficulty: "HARD",
        durationSec: 3,
        previous: { masteryStatus: "NEW", consecutiveIncorrect: 0, mistakeCount: 0 },
      }),
    ).toBe("GUESSING");
  });

  it("classifies a ground-to-a-halt wrong answer as CONCEPTUAL_GAP", () => {
    expect(
      classifyErrorType({
        isCorrect: false,
        difficulty: "EASY",
        durationSec: 120,
        previous: { masteryStatus: "NEW" },
      }),
    ).toBe("CONCEPTUAL_GAP");
  });

  it("treats durationSec 0 as not-provided, skipping the duration rules", () => {
    expect(
      classifyErrorType({
        isCorrect: false,
        difficulty: "EASY",
        durationSec: 0,
        previous: { masteryStatus: "NEW", consecutiveIncorrect: 0, mistakeCount: 0 },
      }),
    ).toBe("CARELESS_MISTAKE");
  });

  it("classifies repeat offenders as CONCEPTUAL_GAP via consecutiveIncorrect", () => {
    expect(
      classifyErrorType({
        isCorrect: false,
        difficulty: "EASY",
        previous: { consecutiveIncorrect: 2, mistakeCount: 1 },
      }),
    ).toBe("CONCEPTUAL_GAP");
  });

  it("classifies repeat offenders as CONCEPTUAL_GAP via total mistakeCount", () => {
    expect(
      classifyErrorType({
        isCorrect: false,
        difficulty: "MEDIUM",
        previous: { consecutiveIncorrect: 0, mistakeCount: 3 },
      }),
    ).toBe("CONCEPTUAL_GAP");
  });

  it("maps difficulty to a category when there is no prior/behavioral evidence", () => {
    expect(
      classifyErrorType({ isCorrect: false, difficulty: "EASY", previous: {} }),
    ).toBe("CARELESS_MISTAKE");
    expect(
      classifyErrorType({ isCorrect: false, difficulty: "MEDIUM", previous: {} }),
    ).toBe("CONFUSION");
    expect(
      classifyErrorType({ isCorrect: false, difficulty: "HARD", previous: {} }),
    ).toBe("CONCEPTUAL_GAP");
  });

  it("falls back to UNKNOWN with no evidence at all", () => {
    expect(classifyErrorType({ isCorrect: false })).toBe("UNKNOWN");
  });

  it("provides a Bengali label for every error type", () => {
    const parsed = parseErrorType("conceptual_gap");
    expect(parsed).toBe("CONCEPTUAL_GAP");
    expect(ERROR_TYPE_LABELS.CONCEPTUAL_GAP).toMatch(/\S/);
  });

  it("rejects invalid error-type strings", () => {
    expect(parseErrorType("NOPE")).toBeUndefined();
    expect(parseErrorType(null)).toBeUndefined();
    expect(parseErrorType(undefined)).toBeUndefined();
    expect(parseErrorType("")).toBeUndefined();
  });
});
/**
 * tests/qb-import-bank-math-indices.test.ts
 * ----------------------------------------------------------------------------
 * Parser guarantees for the Bank Math Indices & Logarithms import pipeline
 * (scripts/import-bank-math-indices.ts):
 *   1. Single-paragraph records parse with Unicode math intact (extraction is
 *      raw); canonical math normalization runs in the import loop via
 *      normalizeMcqFields before the gate.
 *   2. Section headers drive difficulty (Easy/Medium/Hard).
 *   3. Multi-paragraph explanation continuations attach to the prior record.
 *   4. Malformed records are skipped with reasons, never half-imported.
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { parseMathText } from "../scripts/import-bank-math-indices";
import { normalizeMcqFields } from "../backend/services/math";

const canonFields = (r: { question: string; options: string[]; correctAnswer: string; explanation: string }) =>
  normalizeMcqFields({
    question: r.question,
    options: r.options,
    correctAnswer: r.options[0],
    explanation: r.explanation,
  }).record;

describe("parseMathText — bank math indices", () => {
  it("parses a record with LaTeX equations (migrated from Unicode)", () => {
    const { records, skipped } = parseMathText(
      [
        "Section I: Easy Level Questions",
        "Question 1. If 2⁰⁺³ + 2⁰⁺¹ = 320, find the value of x.A. 4B. 5C. 6D. 7Answer: BExplanation: 2⁰ = 32 ⇒ x = 5.",
      ].join("\n"),
    );
    expect(skipped).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      n: 1,
      question: "If 2⁰⁺³ + 2⁰⁺¹ = 320, find the value of x.",
      options: ["4", "5", "6", "7"],
      answerLetter: "B",
      difficulty: "EASY",
    });
    // Canonical normalization (import loop, before the gate) migrates it:
    const canon = canonFields(records[0]);
    expect(canon.question).toBe("If $2^{0+3}$ + $2^{0+1}$ = 320, find the value of x.");
    expect(canon.explanation).toContain("x = 5");
  });

  it("maps Moderate/Difficult sections to MEDIUM/HARD", () => {
    const { records } = parseMathText(
      [
        "Section II: Moderate Level Questions",
        "Question 16. Solve for x: 9ˣ - 10 · 3ˣ + 9 = 0.A. x = 0 onlyB. x = 0 and x = 2C. x = 1 and x = 2D. x = 1 and x = 9Answer: BExplanation: y = 3ˣ.",
        "Section III: Difficult Level Questions",
        "Question 31. Solve the system.A. (4, 4)B. (8, 2)C. (2, 8)D. Both A and BAnswer: DExplanation: Check.",
      ].join("\n"),
    );
    expect(records.map((r) => r.difficulty)).toEqual(["MEDIUM", "HARD"]);
  });

  it("appends explanation continuations to the previous record", () => {
    const { records, skipped } = parseMathText(
      [
        "Section III: Difficult Level Questions",
        "Question 37. Solve the inequality log₀.₅(x² - 5x + 6) ≥ -1.A. [1, 2) ∪ (3, 4]B. (2, 3)C. (-∞, 1] ∪ [4, ∞)D. [1, 4]Answer: AExplanation:",
        "Base 0.5 < 1, so flipping yields x² - 5x + 4 ≤ 0.",
      ].join("\n"),
    );
    expect(skipped).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].explanation).toContain("flipping");
  });

  it("fixes the Q18 superscript-f source quirk (as LaTeX)", () => {
    const { records } = parseMathText(
      "Question 18. If 2ᵃ = 3 and 7⁺ = 8, find it.A. 1B. 2C. 3D. 4Answer: CExplanation: Chain rule.",
    );
    expect(records[0].question).toContain("7ᶠ = 8");
    expect(canonFields(records[0]).question).toContain("$7^{f}$ = 8");
  });

  it("skips records with missing options", () => {
    const { records, skipped } = parseMathText("Question 5. Broken?A. xB. yAnswer: AExplanation: z");
    expect(records).toHaveLength(0);
    expect(skipped.length).toBeGreaterThan(0);
  });
});

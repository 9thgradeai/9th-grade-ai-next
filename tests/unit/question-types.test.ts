import { describe, it, expect } from "vitest";
import { validateQuestionTypeFields } from "~backend/validation";
import { getCorrectSet, isAnswerCorrect, serializeAnswer } from "@/lib/question-type";

const OPTS = ["A", "B", "C", "D"];

describe("validateQuestionTypeFields", () => {
  it("defaults to SINGLE_CHOICE with empty sets", () => {
    expect(validateQuestionTypeFields({ options: OPTS })).toEqual({
      questionType: "SINGLE_CHOICE",
      correctAnswers: [],
      statements: [],
    });
  });

  it("rejects unknown question types", () => {
    expect(() => validateQuestionTypeFields({ questionType: "ESSAY" })).toThrow(/questionType must be one of/);
  });

  it("accepts a valid MULTIPLE_CHOICE set", () => {
    const out = validateQuestionTypeFields({
      questionType: "MULTIPLE_CHOICE",
      options: OPTS,
      correctAnswers: ["A", "C"],
    });
    expect(out).toEqual({ questionType: "MULTIPLE_CHOICE", correctAnswers: ["A", "C"], statements: [] });
  });

  it("rejects MULTIPLE_CHOICE with fewer than 2 correct answers", () => {
    expect(() =>
      validateQuestionTypeFields({ questionType: "MULTIPLE_CHOICE", options: OPTS, correctAnswers: ["A"] }),
    ).toThrow(/at least 2/);
  });

  it("rejects correctAnswers outside options", () => {
    expect(() =>
      validateQuestionTypeFields({ questionType: "MULTIPLE_CHOICE", options: OPTS, correctAnswers: ["A", "Z"] }),
    ).toThrow(/must each match/);
  });

  it("requires ≥ 2 statements for STATEMENT_COMBINATION", () => {
    expect(() =>
      validateQuestionTypeFields({ questionType: "STATEMENT_COMBINATION", options: OPTS, statements: ["Only one"] }),
    ).toThrow(/at least 2 statements/);
    const out = validateQuestionTypeFields({
      questionType: "STATEMENT_COMBINATION",
      options: OPTS,
      statements: ["I. First", "II. Second"],
    });
    expect(out.statements).toHaveLength(2);
  });
});

describe("all-or-nothing grading", () => {
  const multi = { correctAnswer: "A", correctAnswers: ["A", "C"] };
  const single = { correctAnswer: "B", correctAnswers: [] };

  it("getCorrectSet prefers correctAnswers, falls back to correctAnswer", () => {
    expect(getCorrectSet(multi)).toEqual(["A", "C"]);
    expect(getCorrectSet(single)).toEqual(["B"]);
  });

  it("is correct only for the exact set, order-insensitive", () => {
    expect(isAnswerCorrect(multi, ["C", "A"])).toBe(true);
    expect(isAnswerCorrect(multi, ["A"])).toBe(false);
    expect(isAnswerCorrect(multi, ["A", "C", "D"])).toBe(false);
    expect(isAnswerCorrect(multi, ["A", "B"])).toBe(false);
    expect(isAnswerCorrect(single, ["B"])).toBe(true);
    expect(isAnswerCorrect(single, ["B", "C"])).toBe(false);
  });

  it("ignores surrounding whitespace and empties", () => {
    expect(isAnswerCorrect(multi, [" A ", "C", ""])).toBe(true);
  });

  it("serializeAnswer joins picks for the legacy string column", () => {
    expect(serializeAnswer(["A", "C"])).toBe("A ‖ C");
    expect(serializeAnswer([])).toBe("");
  });
});

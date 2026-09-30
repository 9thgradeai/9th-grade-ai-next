import { describe, it, expect } from "vitest";
import { normalizeFieldForDisplay } from "~backend/services/math";
import { toQuestionDTO } from "~backend/services/content";

type Row = Parameters<typeof toQuestionDTO>[0];

const baseRow = (over: Partial<Row>): Row => ({
  id: 1,
  subjectId: 1,
  subject: { nameBn: "গাণিতিক যুক্তি" },
  topic: "t",
  subtopic: "st",
  question: "q?",
  options: ["ক", "খ"],
  correctAnswer: "ক",
  explanation: "",
  difficulty: "MEDIUM",
  year: null,
  sourceExam: "BCS",
  bcsTerm: null,
  questionType: "MCQ",
  correctAnswers: [],
  statements: [],
  media: [],
  paperId: null,
  examId: null,
  questionNumber: null,
  ...over,
});

describe("normalizeFieldForDisplay — read-path safety net", () => {
  it("normalizes raw Unicode math missed by ingestion", () => {
    expect(normalizeFieldForDisplay("If sin x = √3/2, then tan x = ?")).toContain(
      "$\\frac{\\sqrt{3}}{2}$",
    );
  });
  it("returns prose byte-identical", () => {
    const prose = "ক্ষুদ্রতম মৌলিক সংখ্যা কোনটি?";
    expect(normalizeFieldForDisplay(prose)).toBe(prose);
  });
  it("returns REVIEW-grade fields (currency $, garbled spans) untouched", () => {
    for (const raw of ["It costs $80", "The $10 million error", ""]) {
      expect(normalizeFieldForDisplay(raw)).toBe(raw);
    }
  });
  it("leaves canonical LaTeX untouched and is idempotent", () => {
    const canon = "কোন সংখ্যাটি $\\frac{৩}{৪}$ এবং $\\frac{৪}{৫}$ এর মধ্যবর্তী?";
    expect(normalizeFieldForDisplay(canon)).toBe(canon);
    const once = normalizeFieldForDisplay("If sin x = √3/2, then tan x = ?");
    expect(normalizeFieldForDisplay(once)).toBe(once);
  });
  it("never throws on non-strings", () => {
    expect(normalizeFieldForDisplay(null)).toBe("");
    expect(normalizeFieldForDisplay(undefined)).toBe("");
  });
});

describe("toQuestionDTO — display normalization", () => {
  it("serves raw-math rows book-exact while keeping answer-in-options", () => {
    const dto = toQuestionDTO(
      baseRow({
        question: "If sin x = √3/2, then tan x = ?",
        options: ["√3", "1", "1/√3", "1/2"],
        correctAnswer: "√3",
        explanation: "tan 60° = √3।",
      }),
    );
    expect(dto.question).toContain("$\\frac{\\sqrt{3}}{2}$");
    expect(dto.options).toContain("$\\sqrt{3}$");
    expect(dto.options).toContain(dto.correctAnswer);
    expect(dto.explanation).toContain("$\\sqrt{3}$");
  });
  it("passes prose and REVIEW-grade rows through unchanged", () => {
    const dto = toQuestionDTO(
      baseRow({
        question: "ক্ষুদ্রতম মৌলিক সংখ্যা কোনটি?",
        options: ["It costs $80", "খ"],
        correctAnswer: "খ",
      }),
    );
    expect(dto.question).toBe("ক্ষুদ্রতম মৌলিক সংখ্যা কোনটি?");
    expect(dto.options[0]).toBe("It costs $80");
  });
});

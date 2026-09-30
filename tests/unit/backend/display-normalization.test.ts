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
  rawMath: false,
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

describe("toQuestionDTO — rawMath passthrough (book-Unicode import)", () => {
  // Real row from topic 133177 "Indices_and_Logarithms", imported verbatim
  // from the .docx. Every one of these fields WOULD be rewritten by the
  // normalizer, which is exactly why rawMath bypasses it.
  const RAW = {
    question: "If 2ˣ⁺³ + 2ˣ⁺¹ = 320, find the value of x.",
    options: ["4", "5", "6", "7"],
    correctAnswer: "5",
    explanation: "Factoring out 2ˣ, we get 2ˣ(2³ + 2¹) = 320 ⇒ 10 · 2ˣ = 320 ⇒ 2ˣ = 2⁵.",
  };

  it("emits every field byte-identical to the stored Unicode", () => {
    const dto = toQuestionDTO(baseRow({ ...RAW, rawMath: true }));
    expect(dto.question).toBe(RAW.question);
    expect(dto.options).toEqual(RAW.options);
    expect(dto.correctAnswer).toBe(RAW.correctAnswer);
    expect(dto.explanation).toBe(RAW.explanation);
  });

  it("never emits a LaTeX delimiter, even though the normalizer would add one", () => {
    const dto = toQuestionDTO(baseRow({ ...RAW, rawMath: true }));
    expect(normalizeFieldForDisplay(RAW.question, "question")).toContain("$"); // control
    expect(dto.question).not.toContain("$");
    expect(dto.explanation).not.toContain("$");
  });

  it("preserves radicals, true minus signs and Unicode minus in options", () => {
    const dto = toQuestionDTO(
      baseRow({
        rawMath: true,
        question: "Express logₐ √(a √(a √a)) in simplified numerical form.",
        options: ["1/8", "3/4", "7/8", "15/16"],
        correctAnswer: "7/8",
        explanation: "Simplify logₐ √(a √(a √a)).",
      }),
    );
    expect(dto.question).toContain("√");
    expect(dto.options).toEqual(["1/8", "3/4", "7/8", "15/16"]);
    expect(dto.options).toContain(dto.correctAnswer);
  });

  it("keeps answer-in-options intact when the answer is a Unicode minus", () => {
    const dto = toQuestionDTO(
      baseRow({
        rawMath: true,
        question: "Solve for x: 4ˣ = 1/64.",
        options: ["−3", "−2", "3", "1/3"],
        correctAnswer: "−3",
        explanation: "4ˣ = 1/64 = 2⁻⁶.",
      }),
    );
    expect(dto.correctAnswer).toBe("−3");
    expect(dto.options).toContain(dto.correctAnswer);
  });

  it("defaults rawMath to false, so legacy rows keep normalizing", () => {
    const dto = toQuestionDTO(
      baseRow({ question: "If sin x = √3/2, then tan x = ?" }),
    );
    expect(dto.rawMath).toBe(false);
    expect(dto.question).toContain("\\sqrt");
  });
});

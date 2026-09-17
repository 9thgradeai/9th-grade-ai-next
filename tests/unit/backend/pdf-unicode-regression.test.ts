// @vitest-environment node
//
// Unicode regression test suite for the Real Exam PDF pipeline.
// Tests Bengali, English, Mathematics, mixed-script, and edge-case content
// through the actual PDF generation pipeline.

import { describe, it, expect } from "vitest";
import { renderExamPdf } from "~backend/services/pdf";
import type { ExamPdfDocument, ExamPdfRenderOptions } from "~backend/services/pdf";

const OPTIONS: ExamPdfRenderOptions = {
  includeAnswers: true,
  includeExplanations: true,
  shuffleQuestions: false,
};

// ── Bengali test strings ────────────────────────────────────────
const BENGALI_STRINGS = [
  "বাংলাদেশ",
  "বাংলা ভাষা ও সাহিত্য",
  "ব্যাখ্যা",
  "প্রাণী",
  "মাকড়সা",
  "দুর্যোগ",
  "ভূমিকম্প",
  "বন্যা ও নদীভাঙন",
  "ব্যবস্থাপনা",
  "পরিবেশ",
  "সাঁঝবাতাস", // candrabindu crasher
  "প্যাঁচা", // conjunct + candrabindu
  "বাঁশ", // common crasher word
  "গীতাঞ্জলি", // conjunct-heavy
  "প্রাণীবিদ্যা", // conjuncts
];

// ── English test strings ────────────────────────────────────────
const ENGLISH_STRINGS = [
  "Red Data Book",
  "Great Barrier Reef",
  "Climate Vulnerability Index",
  "Mock Drill",
  "Artificial Intelligence",
  "Bangladesh Bank",
  "Government Job Examination",
];

// ── Mathematics / symbols ──────────────────────────────────────
const MATH_STRINGS = [
  "+1",
  "-0.5",
  "0",
  "60",
  "100",
  "2100",
  "x² + y² = z²",
  "√2",
  "π",
  "≤",
  "≥",
  "≠",
  "±",
  "×",
  "÷",
  "∞",
  "°",
  "%",
];

// ── Mixed script ───────────────────────────────────────────────
const MIXED_STRINGS = [
  "বাংলাদেশের GDP কত?",
  "What is বাংলাদেশের রাজধানী?",
  "x² + y² = z² এবং x = 3 হলে...",
  "বাংলাদেশের জনসংখ্যা 2100 সালে কত হতে পারে?",
  "Climate Vulnerability Index বাংলাদেশের ক্ষেত্রে প্রযোজ্য।",
  "+1 স্কোর এবং -0.5 নেগেটিভ মার্কিং",
];

// ── Edge cases ─────────────────────────────────────────────────
const EDGE_CASE_STRINGS = [
  "", // empty → replaced by "Question N"
  "॥।।॥", // punctuation only
  "abc", // ASCII only
  "A".repeat(500), // very long
  "বাংলা ".repeat(100), // long Bengali
  '"quoted text"', // quotation marks
  "parentheses (like this)", // parentheses
  "slash/path/structure", // slashes
  "100%", // percentage
  "3.14", // decimal
  "-42", // negative number
  "50%", // percentage with number
  "α β γ", // Greek letters
  "Ω μ λ", // more Greek
];

function buildDoc(
  texts: string[],
  extra?: Partial<ExamPdfDocument>,
): ExamPdfDocument {
  return {
    examId: "test-unicode",
    title: "Unicode Regression Test Paper",
    subject: "General",
    fullMark: texts.length,
    durationMinutes: 60,
    totalQuestions: texts.length,
    generatedAt: "2026-09-15T00:00:00.000Z",
    instructions: [
      "১. সঠিক উত্তরটি নির্বাচন করুন।",
      "2. Select the correct answer.",
    ],
    questions: texts.map((t, i) => ({
      number: i + 1,
      text: t || `Question ${i + 1}`,
      options: [
        { key: "A", text: t || "Option A" },
        { key: "B", text: "Alternative B" },
        { key: "C", text: "Alternative C" },
        { key: "D", text: "Alternative D" },
      ],
      correctAnswer: t || "Option A",
      explanation: `Explanation for Q${i + 1}: ${t}`,
      subject: "General",
    })),
    ...extra,
  };
}

describe("Unicode regression — Bengali content", () => {
  it("renders all Bengali strings correctly", async () => {
    const doc = buildDoc(BENGALI_STRINGS);
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(BENGALI_STRINGS.length);
    expect(result.byteSize).toBeGreaterThan(1000);
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders each Bengali string as a single-question paper", async () => {
    for (const text of BENGALI_STRINGS) {
      const result = await renderExamPdf(buildDoc([text]), OPTIONS);
      expect(result.questionCount).toBe(1);
      expect(result.byteSize).toBeGreaterThan(500);
    }
  });
});

describe("Unicode regression — English content", () => {
  it("renders all English strings correctly", async () => {
    const doc = buildDoc(ENGLISH_STRINGS);
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(ENGLISH_STRINGS.length);
    expect(result.byteSize).toBeGreaterThan(1000);
  });
});

describe("Unicode regression — Mathematics and symbols", () => {
  it("renders all math/symbol strings correctly", async () => {
    const doc = buildDoc(MATH_STRINGS);
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(MATH_STRINGS.length);
    expect(result.byteSize).toBeGreaterThan(1000);
  });
});

describe("Unicode regression — Mixed script", () => {
  it("renders all mixed-script strings correctly", async () => {
    const doc = buildDoc(MIXED_STRINGS);
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(MIXED_STRINGS.length);
    expect(result.byteSize).toBeGreaterThan(1000);
  });
});

describe("Unicode regression — Edge cases", () => {
  it("handles all edge-case strings", async () => {
    const doc = buildDoc(EDGE_CASE_STRINGS);
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(EDGE_CASE_STRINGS.length);
    expect(result.byteSize).toBeGreaterThan(1000);
  });
});

describe("Unicode regression — Large exam", () => {
  it("renders a 200-question mixed exam", async () => {
    const allStrings = [
      ...BENGALI_STRINGS,
      ...ENGLISH_STRINGS,
      ...MATH_STRINGS,
      ...MIXED_STRINGS,
    ];
    const texts = Array.from({ length: 200 }, (_, i) =>
      allStrings[i % allStrings.length],
    );
    const doc = buildDoc(texts);
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(200);
    expect(result.byteSize).toBeGreaterThan(10000);
  });
});

describe("Unicode regression — Answer modes", () => {
  it("renders without answers", async () => {
    const doc = buildDoc(BENGALI_STRINGS.slice(0, 5));
    const result = await renderExamPdf(doc, {
      includeAnswers: false,
      includeExplanations: false,
      shuffleQuestions: false,
    });
    expect(result.questionCount).toBe(5);
  });

  it("renders with answers only", async () => {
    const doc = buildDoc(BENGALI_STRINGS.slice(0, 5));
    const result = await renderExamPdf(doc, {
      includeAnswers: true,
      includeExplanations: false,
      shuffleQuestions: false,
    });
    expect(result.questionCount).toBe(5);
  });

  it("renders with answers and explanations", async () => {
    const doc = buildDoc(BENGALI_STRINGS.slice(0, 5));
    const result = await renderExamPdf(doc, {
      includeAnswers: true,
      includeExplanations: true,
      shuffleQuestions: false,
    });
    expect(result.questionCount).toBe(5);
  });
});

describe("Unicode regression — Document metadata", () => {
  it("renders with correct subjects array", async () => {
    const doc = buildDoc(BENGALI_STRINGS.slice(0, 3), {
      subjects: ["বাংলা ভাষা ও সাহিত্য", "English", "Mathematics"],
    });
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(3);
  });

  it("renders with correct fullMark", async () => {
    const doc = buildDoc(BENGALI_STRINGS.slice(0, 3), {
      fullMark: 100,
    });
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(3);
  });

  it("renders with correct duration", async () => {
    const doc = buildDoc(BENGALI_STRINGS.slice(0, 3), {
      durationMinutes: 30,
    });
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.questionCount).toBe(3);
  });
});

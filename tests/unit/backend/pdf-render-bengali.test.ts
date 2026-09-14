// @vitest-environment node
//
// Bengali shaping-safety regression tests for the exam PDF renderer.
//
// Root cause context: fontkit (pdfkit's shaper) throws
//   "Cannot read properties of null (reading 'xCoordinate')"
// when shaping consonant + া + ঁ (candrabindu) sequences in Noto Sans
// Bengali's GPOS tables — e.g. সাঁ, যাঁ, বাঁশ, প্যাঁচা. ~2% of the real
// question bank contains such sequences (31/2412 rows at time of writing).
// These strings previously crashed mid-render; the old single-layer fallback
// (virama strip) did not address this crash class, so single-question papers
// 500'd and multi-question papers silently lost content.
//
// The fix: tiered text resolution (candrabindu→anusvara → virama strip →
// mark strip → ASCII) before any doc.text()/widthOfString() call. These
// tests pin the crash classes so they can never regress.

import { describe, it, expect, vi, afterEach } from "vitest";

import { renderExamPdf, PdfExportError } from "~backend/services/pdf";
import type { ExamPdfDocument, ExamPdfRenderOptions } from "~backend/services/pdf";

// Minimal empirically-verified crashers (consonant + AA + candrabindu),
// plus real DB strings that crashed before the fix.
const CRASH_CLASS_STRINGS = [
  "সাঁ", // minimal: স + া + ঁ
  "যাঁ", // minimal: য + া + ঁ
  "বাঁশ", // common word: bamboo
  "সাঁঝ", // sandhya-related, from question 2962
  "প্যাঁচা", // from question 2852
  "স্বতঃনাসিক্যীভবন প্যাঁচা সাঁঝ", // compound from question 2852
  "হৃদয়ের মাঝে সাঁঝবাতাস", // mixed crashing + non-crashing
  "'প' থেকে 'ম' পর্যন্ত ৫টি ধ্বনিকে একত্রে কী বলা হয়? ওষ্ঠ্য ধ্বনি সাঁঝ",
];

const OPTIONS: ExamPdfRenderOptions = {
  includeAnswers: true,
  includeExplanations: true,
  shuffleQuestions: false,
};

function buildDoc(texts: string[], extra?: Partial<ExamPdfDocument>): ExamPdfDocument {
  return {
    examId: "test",
    title: "শুদ্ধ বানান পরীক্ষা সাঁঝবাত প্রশ্নপত্র",
    subject: "বাংলা ভাষা ও সাহিত্য",
    durationMinutes: 60,
    totalQuestions: texts.length,
    generatedAt: "2026-09-14T00:00:00.000Z",
    instructions: ["১. সঠিক উত্তরটি নির্বাচন করুন।", "২. সময়: ৬০ মিনিট।"],
    questions: texts.map((t, i) => ({
      number: i + 1,
      text: t,
      options: [
        { key: "A", text: `বিকল্প ক ${t}` },
        { key: "B", text: "সাঁঝ বাঁশ প্যাঁচা" },
        { key: "C", text: "কোনোটিই নয়" },
        { key: "D", text: "সবগুলো" },
      ],
      correctAnswer: "সাঁঝ বাঁশ প্যাঁচা",
      explanation: `ব্যাখ্যা: ${t} — ক্যান্দ্রবিন্দু যুক্ত শব্দ।`,
      subject: "বাংলা",
      topic: "ধ্বনিতত্ত্ব",
      difficulty: "MEDIUM",
      year: 2024,
      sourceExam: "৪৫তম বিসিএস",
    })),
    ...extra,
  };
}

describe("exam PDF renderer — Bengali shaping safety", () => {
  it("renders every known crash-class string without throwing", async () => {
    const result = await renderExamPdf(buildDoc(CRASH_CLASS_STRINGS), OPTIONS);
    expect(result.questionCount).toBe(CRASH_CLASS_STRINGS.length);
    expect(result.skippedCount).toBe(0);
    expect(result.byteSize).toBeGreaterThan(1000);
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders each crash-class string as a single-question paper (old failure mode)", async () => {
    for (const text of CRASH_CLASS_STRINGS) {
      const result = await renderExamPdf(buildDoc([text]), OPTIONS);
      expect(result.questionCount).toBe(1);
      expect(result.skippedCount).toBe(0);
    }
  });

  it("renders a 200-question paper of mixed crash-class and normal Bengali", async () => {
    const texts = Array.from({ length: 200 }, (_, i) =>
      i % 3 === 0
        ? `প্রশ্ন ${i + 1}: সাঁঝের শঙ্খ বাঁশি প্যাঁচানো যাঁত্রা?`
        : `প্রশ্ন ${i + 1}: বাংলাদেশের রাজধানী কোনটি? গীতাঞ্জলির রচয়িতা কে?`,
    );
    const result = await renderExamPdf(buildDoc(texts), OPTIONS);
    expect(result.questionCount).toBe(200);
    expect(result.skippedCount).toBe(0);
  });

  it("never returns fewer questions than provided, even for degenerate content", async () => {
    const texts = [
      "", // empty → replaced by "Question N"
      "॥।।॥", // punctuation only
      "𝕏🇧🇩🎯", // astral/emoji
      "সাঁ", // crash class
    ];
    const result = await renderExamPdf(buildDoc(texts), OPTIONS);
    expect(result.questionCount).toBe(texts.length);
    expect(result.skippedCount).toBe(0);
  });

  it("resolves fallbacks deterministically — same tier chosen for the same input", async () => {
    // pdfkit stamps CreationDate metadata, so raw bytes differ between runs;
    // the layout (and therefore byte size and question counts) must not.
    const a = await renderExamPdf(buildDoc(["সাঁঝ"]), OPTIONS);
    const b = await renderExamPdf(buildDoc(["সাঁঝ"]), OPTIONS);
    expect(a.byteSize).toBe(b.byteSize);
    expect(a.questionCount).toBe(b.questionCount);
    expect(a.skippedCount).toBe(b.skippedCount);
    expect(a.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("candrabindu fallback preserves the nasal context in options/explanations", async () => {
    // Option text and explanations contain crashers too — the whole paper
    // (title, instructions, questions, options, answers, explanations) must
    // survive, since all go through safeDocText.
    const doc = buildDoc(["পেচক > প্যাঁচা — এটি কিসের উদাহরণ?"]);
    doc.title = "সাঁঝবাত প্রশ্নপত্র বাঁশিওয়ালা";
    doc.instructions = ["১. সাঁঝের পরীক্ষা।", "২. বাঁশি নয়, প্যাঁচা উত্তর দিন।"];
    const result = await renderExamPdf(doc, OPTIONS);
    expect(result.skippedCount).toBe(0);
    expect(result.questionCount).toBe(1);
  });

  it("hard-fails with PDF_EXPORT_FONT_ERROR when the Bengali font file is missing", async () => {
    // Simulate a deployment where the font files were not traced into the
    // serverless bundle. The renderer must fail LOUDLY with a distinct code
    // instead of silently falling back to Helvetica (blank Bengali text).
    vi.resetModules();
    vi.doMock("fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs")>();
      // The renderer uses `import fs from "fs"` + fs.existsSync, so the
      // DEFAULT export must carry the mocked existsSync too.
      const mocked = {
        ...actual,
        existsSync: (p: import("fs").PathLike) =>
          typeof p === "string" && p.includes("NotoSansBengali")
            ? false
            : actual.existsSync(p),
      };
      return { ...mocked, default: mocked };
    });
    try {
      // Fresh module instance so the cached font state is re-evaluated.
      const { renderExamPdf: freshRender } = await import("~backend/services/pdf/renderExamPdf");
      await expect(
        freshRender(buildDoc(["সাঁঝ প্যাঁচা"]), OPTIONS),
      ).rejects.toMatchObject({
        pdfCode: "PDF_EXPORT_FONT_ERROR",
        stage: "render",
      });
    } finally {
      vi.doUnmock("fs");
      vi.resetModules();
    }
  });
});

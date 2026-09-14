// backend/services/pdf/renderExamPdf.ts
// Deterministic PDF renderer for exam papers.
// Uses pdfkit with embedded Noto Sans Bengali for full Unicode (Bengali + English) support.
// The renderer is a pure function: ExamPdfDocument → Buffer.
//
// ── Bengali shaping safety ──────────────────────────────────────
// fontkit (pdfkit's shaper) crashes on certain real-world Bengali sequences
// in Noto Sans Bengali's GPOS tables. Empirically minimized crasher:
//   consonant + া (AA vowel sign) + ঁ (candrabindu), e.g. সাঁ / যাঁ / বাঁ
//   → "Cannot read properties of null (reading 'xCoordinate')" (null anchor)
// ~2% of the real question bank contains such sequences, so EVERY string is
// resolved through a tiered fallback BEFORE it reaches doc.text():
//   1. original text (shapes fine for ~98% of content)
//   2. candrabindu → anusvara (ঁ → ং) — same visible nasal dot, shapes OK
//   3. + virama stripped — readable fallback for conjunct crash classes
//   4. + all Bengali combining marks stripped — consonant skeleton
//   5. ASCII-only — always shapeable, guaranteed last resort
// widthOfString() runs fontkit's full layout, so it is a faithful probe:
// if measurement succeeds, doc.text() will not throw (verified empirically).

import "server-only";

import fs from "fs";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require("pdfkit") as typeof import("pdfkit");

import type {
  ExamPdfDocument,
  ExamPdfRenderOptions,
  ExamPdfRenderResult,
  ExamPdfQuestion,
} from "./examPdfTypes";
import { PdfExportError } from "./examPdfErrors";

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

// ── Font loading (cached at module level) ──────────────────────

let _fontRegular: Buffer | null = null;
let _fontBold: Buffer | null = null;
let _fontLoadAttempted = false;
let _fontLoadError: string | null = null;

function ensureFonts(): void {
  if (_fontLoadAttempted) return;
  _fontLoadAttempted = true;

  try {
    const fontsDir = path.join(process.cwd(), "fonts");
    const regularPath = path.join(fontsDir, "NotoSansBengali-Regular.ttf");
    const boldPath = path.join(fontsDir, "NotoSansBengali-Bold.ttf");

    if (fs.existsSync(regularPath)) {
      _fontRegular = fs.readFileSync(regularPath);
    } else {
      _fontLoadError = `Bengali font not found at ${regularPath}`;
    }

    if (fs.existsSync(boldPath)) {
      _fontBold = fs.readFileSync(boldPath);
    }
  } catch (err) {
    _fontLoadError = `Failed to load Bengali fonts: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Text helpers ───────────────────────────────────────────────

/** Coerce any value to a safe string (never throws on null/undefined). */
function safeStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

/**
 * Strip characters that can corrupt PDF string encoding or layout:
 * C0 controls (except \t \n), DEL, and lone UTF-16 surrogates.
 */
function sanitizeText(value: unknown, maxLen = 2000): string {
  const s = safeStr(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  return s.length > maxLen ? s.slice(0, maxLen) + "\u2026" : s;
}

/**
 * Bengali virama (halant ্ U+09CD) creates conjunct consonants that crash
 * fontkit's OpenType GPOS shaping for certain sequences (e.g. ra-phala + consonant).
 * This strips virama to produce readable fallback text.
 */
function stripBengaliVirama(text: string): string {
  return text.replace(/\u09CD/g, "");
}

/**
 * True if the CURRENT font can shape the text without throwing. widthOfString
 * executes fontkit's full layout (GSUB+GPOS), making it a faithful probe for
 * the candrabindu null-anchor GPOS crash and other shaping faults.
 */
function shapeOk(doc: PDFKit.PDFDocument, text: string): boolean {
  try {
    doc.widthOfString(text);
    return true;
  } catch {
    return false;
  }
}

/** Bengali combining marks (vowel signs, nukta, virama, anusvara family…). */
const BENGALI_MARKS = /[\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB\u09CC\u09CD\u09D7\u09E2\u09E3]/g;

/**
 * Progressively degraded renderable variants of a Bengali string, ordered by
 * fidelity. Each tier addresses a known fontkit shaping crash class.
 */
function bengaliRenderVariants(text: string): string[] {
  // Tier 2: candrabindu → anusvara. The REAL crasher (সাঁ/যাঁ/বাঁ…). Anusvara
  // renders the same nasal dot and shapes correctly in Noto Sans Bengali.
  const nasalFixed = text.replace(/\u0981/g, "\u0982");
  // Tier 3: + virama stripped (older conjunct crash class).
  const viramaFixed = stripBengaliVirama(nasalFixed);
  // Tier 4: + every Bengali combining mark stripped — bare consonant skeleton.
  const skeleton = nasalFixed.replace(BENGALI_MARKS, "");
  // Tier 5: ASCII-only — always shapeable in any font.
  const ascii = text.replace(/[^\u0000-\u007F]/g, "");
  return [nasalFixed, viramaFixed, skeleton, ascii];
}

/**
 * Resolve a string to a variant the CURRENT font can shape without throwing,
 * preferring the highest-fidelity variant. Never returns null/undefined.
 */
function resolveRenderableText(doc: PDFKit.PDFDocument, text: string): string {
  const safe = safeStr(text);
  if (shapeOk(doc, safe)) return safe;
  for (const variant of bengaliRenderVariants(safe)) {
    if (variant && variant !== safe && shapeOk(doc, variant)) return variant;
  }
  return safe; // unreachable in practice — per-question net catches the rest
}

type PdfTextOptions = {
  width?: number;
  align?: "center" | "justify" | "left" | "right";
  continued?: boolean;
  indent?: number;
  link?: string;
  underline?: boolean;
  strike?: boolean;
  oblique?: boolean | number;
  alignOptions?: "center" | "justify" | "left" | "right";
};

/**
 * Safe wrapper around doc.text(). The text is FIRST resolved to a shapeable
 * variant (resolveRenderableText), so doc.text() receives fontkit-safe input;
 * the try/catch remains as a final net for unexpected layout faults.
 */
function safeDocText(
  doc: PDFKit.PDFDocument,
  text: string,
  x?: number | number[] | PdfTextOptions,
  y?: number,
  options?: PdfTextOptions,
): PDFKit.PDFDocument {
  const resolved = resolveRenderableText(doc, text);
  try {
    if (typeof x === "number" && typeof y === "number") {
      return doc.text(resolved, x, y, options);
    }
    return doc.text(resolved, x as PdfTextOptions);
  } catch {
    // Net: fall back to guaranteed-shapeable ASCII, swallow any residual fault.
    const ascii = safeStr(text).replace(/[^\u0000-\u007F]/g, "");
    try {
      if (typeof x === "number" && typeof y === "number") {
        return doc.text(ascii, x, y, options);
      }
      return doc.text(ascii, x as PdfTextOptions);
    } catch {
      return doc;
    }
  }
}

// ── Text wrapping with Bengali support ─────────────────────────

function wrapText(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string[] {
  const safe = safeStr(text);
  if (!safe) return [""];

  // With embedded Noto Sans Bengali, widthOfString should return non-zero values.
  const probe = doc.widthOfString(safe);
  if (probe === 0) {
    // Fallback: character-count wrapping for any unmeasurable text
    const approxCharsPerLine = 60;
    const out: string[] = [];
    for (let i = 0; i < safe.length; i += approxCharsPerLine) {
      out.push(safe.slice(i, i + approxCharsPerLine));
    }
    return out.length > 0 ? out : [""];
  }

  const words = safe.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (doc.widthOfString(testLine) > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Single word wider than column — still needs its own line
        lines.push(word);
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function drawTextWithWrap(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: { font?: string; fontSize?: number; lineGap?: number } = {},
): number {
  const { font = "Bengali", fontSize = 10, lineGap = 2 } = options;
  const safe = safeStr(text);
  doc.font(font).fontSize(fontSize);

  // Resolve to a shapeable variant BEFORE measuring/wrapping — fontkit faults
  // surface during widthOfString layout, so resolution guarantees every line
  // below can be measured and drawn.
  const resolved = resolveRenderableText(doc, safe);
  const lines: string[] =
    doc.widthOfString(resolved) > maxWidth ? wrapText(doc, resolved, maxWidth) : [resolved];

  let currentY = y;
  for (const line of lines) {
    const safeLine = resolveRenderableText(doc, line);
    try {
      doc.text(safeLine, x, currentY, { width: maxWidth, align: "left" });
    } catch {
      // Net: ASCII fallback for the line; swallow residual faults.
      try {
        doc.text(safeLine.replace(/[^\u0000-\u007F]/g, ""), x, currentY, { width: maxWidth, align: "left" });
      } catch {
        /* skip unrenderable line */
      }
    }
    currentY += doc.currentLineHeight() + lineGap;
  }
  return currentY;
}

// ── Question normalization ─────────────────────────────────────

function normalizeQuestion(q: ExamPdfDocument["questions"][number], index: number): ExamPdfQuestion {
  return {
    number: q.number ?? index + 1,
    text: sanitizeText(q.text).trim() || `Question ${index + 1}`,
    options: Array.isArray(q.options)
      ? q.options
          .filter((o) => o && typeof o.text === "string" && o.text.trim() !== "")
          .map((o) => ({ key: o.key, text: sanitizeText(o.text) }))
          .filter((o) => o.text !== "")
      : [],
    marks: typeof q.marks === "number" ? q.marks : undefined,
    subject: sanitizeText(q.subject, 200).trim() || undefined,
    topic: sanitizeText(q.topic, 200).trim() || undefined,
    subtopic: sanitizeText(q.subtopic, 200).trim() || undefined,
    difficulty: sanitizeText(q.difficulty, 20).trim() || undefined,
    year: typeof q.year === "number" ? q.year : undefined,
    sourceExam: sanitizeText(q.sourceExam, 200).trim() || undefined,
    correctAnswer: sanitizeText(q.correctAnswer).trim() || undefined,
    explanation: sanitizeText(q.explanation).trim() || undefined,
  };
}

function answerLabelFor(q: ExamPdfQuestion): string {
  if (!q.correctAnswer) return "\u2014";
  const idx = q.options.findIndex((o) => o.text.trim() === q.correctAnswer);
  return idx >= 0 ? (OPTION_LABELS[idx] ?? q.correctAnswer) : q.correctAnswer;
}

// ── Seeded shuffle (deterministic) ─────────────────────────────

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray<T>(array: T[], seed: number): T[] {
  const rng = mulberry32(seed);
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Main renderer ──────────────────────────────────────────────

/**
 * Render an ExamPdfDocument to a PDF byte buffer.
 *
 * This is an async function because pdfkit's stream finalization is async.
 * The renderer is otherwise pure: it receives a normalized document and
 * returns bytes. It does NOT access the database or network.
 */
export async function renderExamPdf(
  doc: ExamPdfDocument,
  options: ExamPdfRenderOptions,
  seed?: number,
): Promise<ExamPdfRenderResult> {
  ensureFonts();

  // Hard-fail when the embedded Bengali font is unavailable. The previous
  // behavior silently fell back to Helvetica, producing a PDF whose Bengali
  // content rendered as blanks — an undiagnosable failure that looked
  // identical to a shaping crash. A missing font is a deployment problem
  // (font files not traced into the serverless bundle), so it gets its own
  // error code (PDF_EXPORT_FONT_ERROR) instead of a generic render error.
  if (!_fontRegular || _fontRegular.length === 0) {
    throw new PdfExportError(
      500,
      "Bengali font is not available on the server",
      "PDF_EXPORT_FONT_ERROR",
      "render",
      options.requestId ?? "unknown",
    );
  }

  const BENGALI = "Bengali";
  const BENGALI_BOLD = "Bengali-Bold";

  // Create PDF document — bufferPages lets us count pages at the end
  const pdfDoc = new PDFDocument({
    size: "A4",
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: {
      Title: doc.title,
      Author: "9Th-Grade AI",
      Subject: doc.subject ?? "",
      Keywords: "BCS, Exam, Practice, Bangladesh",
    },
    bufferPages: true,
  });

  // Register Bengali font (Noto Sans Bengali embedded)
  if (_fontRegular && _fontRegular.length > 0) {
    pdfDoc.registerFont(BENGALI, _fontRegular);
    pdfDoc.registerFont(BENGALI_BOLD, _fontBold && _fontBold.length > 0 ? _fontBold : _fontRegular);
  } else {
    // Graceful fallback: Helvetica (English only, Bengali invisible)
    pdfDoc.registerFont(BENGALI, "Helvetica");
    pdfDoc.registerFont(BENGALI_BOLD, "Helvetica-Bold");
  }

  // Collect PDF bytes via stream events
  const chunks: Buffer[] = [];
  pdfDoc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const pdfPromise = new Promise<Buffer>((resolve, reject) => {
    pdfDoc.on("end", () => resolve(Buffer.concat(chunks)));
    pdfDoc.on("error", reject);
  });

  // Prepare questions
  let questions = doc.questions.map((q, i) => normalizeQuestion(q, i));
  if (options.shuffleQuestions) {
    questions = shuffleArray(questions, seed ?? Date.now());
  }

  // ── HEADER PAGE ─────────────────────────────────────────────
  pdfDoc.font(BENGALI_BOLD).fontSize(20).fillColor("#1a1a2e");
  safeDocText(pdfDoc, doc.title, { align: "center" });
  pdfDoc.moveDown(0.5);

  if (doc.subject) {
    pdfDoc.font(BENGALI).fontSize(12).fillColor("#4a4a6a");
    safeDocText(pdfDoc, doc.subject, { align: "center" });
    pdfDoc.moveDown(0.5);
  }

  pdfDoc.font(BENGALI).fontSize(10).fillColor("#666666");
  pdfDoc.text(`Duration: ${doc.durationMinutes} minutes`, { align: "center" });
  pdfDoc.text(`Total Questions: ${questions.length}`, { align: "center" });
  pdfDoc.text(
    `Generated: ${new Date(doc.generatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`,
    { align: "center" },
  );
  pdfDoc.moveDown(1);

  // Separator
  pdfDoc.strokeColor("#e0e0e0").lineWidth(1).moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke();
  pdfDoc.moveDown(1);

  // ── QUESTIONS ──────────────────────────────────────────────
  const contentWidth = pdfDoc.page.width - 140; // 100 margins + 40 indent

  // ── INSTRUCTIONS ───────────────────────────────────────────
  if (doc.instructions.length > 0) {
    pdfDoc.font(BENGALI_BOLD).fontSize(12).fillColor("#1a1a2e");
    safeDocText(pdfDoc, "Instructions");
    pdfDoc.underline(pdfDoc.x, pdfDoc.y - 16, pdfDoc.widthOfString("Instructions"), 1);
    pdfDoc.moveDown(0.5);

    pdfDoc.font(BENGALI).fontSize(10).fillColor("#333333");
    for (const inst of doc.instructions) {
      safeDocText(pdfDoc, inst, 70, pdfDoc.y, { width: contentWidth });
      pdfDoc.moveDown(0.3);
    }
    pdfDoc.moveDown(1);

    pdfDoc.strokeColor("#e0e0e0").lineWidth(1).moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke();
    pdfDoc.moveDown(1);
  }

  let renderedCount = 0;
  const skipped: number[] = [];
  const renderedQuestions: ExamPdfQuestion[] = [];

  const renderQuestion = (q: ExamPdfQuestion, i: number) => {
    // Page break guard — keep at least 150pt for the question
    if (pdfDoc.y > pdfDoc.page.height - 150) {
      pdfDoc.addPage();
    }

    // Question number + text
    pdfDoc.font(BENGALI_BOLD).fontSize(11).fillColor("#1a1a2e");
    safeDocText(pdfDoc, `Q${q.number}.`, { continued: true });
    pdfDoc.font(BENGALI).fontSize(11);
    safeDocText(pdfDoc, ` ${q.text}`);

    // Metadata tags (subject / topic / difficulty etc.)
    pdfDoc.moveDown(0.3);
    pdfDoc.font("Bengali").fontSize(8).fillColor("#888888");
    const metaParts: string[] = [];
    if (q.subject) metaParts.push(q.subject);
    if (q.topic) metaParts.push(q.topic);
    if (q.subtopic && q.subtopic !== q.topic) metaParts.push(q.subtopic);
    if (q.difficulty) metaParts.push(`Difficulty: ${q.difficulty}`);
    if (q.year) metaParts.push(`Year: ${q.year}`);
    if (q.sourceExam) metaParts.push(`Source: ${q.sourceExam}`);
    if (metaParts.length > 0) {
      safeDocText(pdfDoc, metaParts.join(" | "), 70, pdfDoc.y, { width: contentWidth });
    }

    pdfDoc.moveDown(0.5);

    // Options
    for (let j = 0; j < q.options.length; j++) {
      const option = q.options[j];
      pdfDoc.font(BENGALI).fontSize(10).fillColor("#333333");
      const optionText = `${OPTION_LABELS[j] ?? j + 1}. ${option.text}`;
      drawTextWithWrap(pdfDoc, optionText, 70, pdfDoc.y, contentWidth - 20, {
        font: BENGALI,
        fontSize: 10,
        lineGap: 1,
      });
      pdfDoc.moveDown(0.2);
    }

    // Answer / explanation
    if (options.includeAnswers || options.includeExplanations) {
      pdfDoc.moveDown(0.3);
      if (options.includeAnswers) {
        pdfDoc.font(BENGALI_BOLD).fontSize(10).fillColor("#27ae60");
        safeDocText(pdfDoc, `Answer: ${answerLabelFor(q)}`, 70, pdfDoc.y, { width: contentWidth });
      }
      if (options.includeExplanations && q.explanation) {
        pdfDoc.moveDown(0.2);
        pdfDoc.font(BENGALI).fontSize(9).fillColor("#2c3e50");
        safeDocText(pdfDoc, "Explanation:", 70, pdfDoc.y, { width: contentWidth, continued: true });
        pdfDoc.font(BENGALI).fontSize(9);
        drawTextWithWrap(pdfDoc, q.explanation, 90, pdfDoc.y, contentWidth - 40, {
          font: BENGALI,
          fontSize: 9,
          lineGap: 1,
        });
      }
    }

    pdfDoc.moveDown(0.8);

    // Separator between questions
    if (i < questions.length - 1) {
      pdfDoc.strokeColor("#f0f0f0").lineWidth(0.5).moveTo(50, pdfDoc.y).lineTo(545, pdfDoc.y).stroke();
      pdfDoc.moveDown(0.5);
    }
  };

  for (let i = 0; i < questions.length; i++) {
    try {
      renderQuestion(questions[i], renderedQuestions.length);
      renderedQuestions.push(questions[i]);
      renderedCount += 1;
    } catch (questionErr) {
      skipped.push(i + 1);
      console.error(
        `[pdf-render] skipped unrenderable question #${i + 1}:`,
        questionErr instanceof Error ? questionErr.message : questionErr,
      );
    }
  }

  if (renderedCount === 0) {
    pdfDoc.end();
    throw new Error("No renderable questions provided");
  }

  // ── ANSWER KEY (separate page) ─────────────────────────────
  if (options.includeAnswers && !options.includeExplanations) {
    pdfDoc.addPage();
    pdfDoc.font(BENGALI_BOLD).fontSize(16).fillColor("#1a1a2e");
    safeDocText(pdfDoc, "Answer Key", { align: "center" });
    pdfDoc.underline(pdfDoc.x, pdfDoc.y - 20, pdfDoc.widthOfString("Answer Key"), 1);
    pdfDoc.moveDown(1);

    pdfDoc.font(BENGALI).fontSize(10).fillColor("#333333");
    for (let i = 0; i < renderedQuestions.length; i++) {
      safeDocText(pdfDoc, `Q${renderedQuestions[i].number}: ${answerLabelFor(renderedQuestions[i])}`, 70, pdfDoc.y, { width: contentWidth });
      if ((i + 1) % 3 === 0) pdfDoc.moveDown(0.5);
    }
  }

  // Finalize the PDF stream
  pdfDoc.end();

  // Await the stream completion — pdfkit emits all data events synchronously
  // during end(), but the 'end' event fires in the next microtask.
  const buffer = await pdfPromise;

  return {
    buffer,
    byteSize: buffer.length,
    questionCount: renderedCount,
    skippedCount: skipped.length,
  };
}

/** Check if Bengali fonts are loaded (for diagnostics). */
export function BengaliFontsAvailable(): boolean {
  ensureFonts();
  return _fontRegular !== null;
}

/** Get font loading status for diagnostics. */
export function getFontStatus(): { regular: boolean; bold: boolean; error: string | null } {
  ensureFonts();
  return {
    regular: _fontRegular !== null,
    bold: _fontBold !== null,
    error: _fontLoadError,
  };
}

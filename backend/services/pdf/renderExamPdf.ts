// Production-grade Chromium headless PDF renderer for Real Exam.
// Unicode-first, subject-agnostic, print-ready PDF generation.
import "server-only";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  ExamPdfDocument,
  ExamPdfRenderOptions,
  ExamPdfRenderResult,
  ExamPdfQuestion,
} from "./examPdfTypes";
import { PdfExportError } from "./examPdfErrors";
import { sanitizeForPdf } from "./unicode";

// ── Font loading (cached at module level) ───────────────────────
const FONTS_DIR = path.join(process.cwd(), "fonts");

let _fontCache: Record<string, string> | null = null;

function loadBase64(name: string): string {
  if (_fontCache && _fontCache[name]) return _fontCache[name];
  const p = path.join(FONTS_DIR, name);
  if (!fs.existsSync(p)) {
    throw new PdfExportError(
      500,
      `Font missing: ${p}`,
      "PDF_EXPORT_FONT_ERROR",
      "render",
      "unknown",
    );
  }
  const data = fs.readFileSync(p).toString("base64");
  if (!_fontCache) _fontCache = {};
  _fontCache[name] = data;
  return data;
}

function fontFaceCss(): string {
  const b = loadBase64("NotoSansBengali-Regular.ttf");
  const bb = loadBase64("NotoSansBengali-Bold.ttf");
  const l = loadBase64("NotoSans-Regular.ttf");
  const lb = loadBase64("NotoSans-Bold.ttf");
  const m = loadBase64("NotoSansMath.ttf");
  const s = loadBase64("NotoSansSymbols2.ttf");

  return (
    `@font-face{font-family:'Noto Sans Bengali';src:url(data:font/ttf;base64,${b})format('truetype');font-weight:400;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans Bengali';src:url(data:font/ttf;base64,${bb})format('truetype');font-weight:700;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans';src:url(data:font/ttf;base64,${l})format('truetype');font-weight:400;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans';src:url(data:font/ttf;base64,${lb})format('truetype');font-weight:700;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans Math';src:url(data:font/ttf;base64,${m})format('truetype');font-weight:400;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans Symbols 2';src:url(data:font/ttf;base64,${s})format('truetype');font-weight:400;font-style:normal;font-display:swap;}`
  );
}

// ── Font stacks ─────────────────────────────────────────────────
// Universal stack: Bengali → Latin → Math → Symbols → fallback
const UNIVERSAL_FONT =
  "'Noto Sans Bengali', 'Noto Sans', 'Noto Sans Math', 'Noto Sans Symbols 2', sans-serif";

// ── HTML escaping ───────────────────────────────────────────────
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Build question HTML ─────────────────────────────────────────
function buildQuestionHtml(
  q: ExamPdfQuestion,
  idx: number,
  opts: ExamPdfRenderOptions,
): string {
  const num = sanitizeForPdf(String(q.number || idx + 1), 10);
  const text = sanitizeForPdf(q.text, 4000);
  const meta = [q.subject, q.topic, q.subtopic]
    .filter(Boolean)
    .map((s) => sanitizeForPdf(s || "", 100))
    .join(" • ");

  // Options — compact layout
  let optionsHtml = "";
  if (q.options && q.options.length > 0) {
    const items = q.options
      .map((o, j) => {
        const label = sanitizeForPdf(o.key || String(j + 1), 10);
        const oText = sanitizeForPdf(o.text, 3000);
        return `<li style="padding-left:18px;margin-bottom:1px;position:relative;"><span style="position:absolute;left:0;font-weight:700;color:#111827;">${escapeHtml(label)}.</span><span>${escapeHtml(oText)}</span></li>`;
      })
      .join("");
    optionsHtml = `<ul style="list-style:none;margin:2px 0 4px 18px;padding:0;">${items}</ul>`;
  }

  // Answer section — compact
  let answersSection = "";
  if (opts.includeAnswers && q.correctAnswer) {
    const answerText = sanitizeForPdf(String(q.correctAnswer), 2000);
    answersSection += `<div style="margin:6px 0;padding:4px 8px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:3px;"><span style="font-weight:700;font-size:8pt;color:#166534;">Answer: </span><span style="font-size:8pt;color:#14532d;">${escapeHtml(answerText)}</span></div>`;
  }
  if (opts.includeExplanations && q.explanation) {
    const explText = sanitizeForPdf(q.explanation, 4000);
    answersSection += `<div style="margin:3px 0;padding:4px 8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:3px;font-size:7.5pt;color:#1e3a5a;line-height:1.4;">${escapeHtml(explText)}</div>`;
  }

  return `<section style="padding:4px 0;margin-top:4px;border-top:1px solid #e5e7eb;break-inside:avoid;column-break-inside:avoid;"><div style="font-weight:700;color:#111827;margin-bottom:2px;font-size:9pt;">${escapeHtml(num)}. <span style="font-weight:400;">${escapeHtml(text)}</span></div>${meta ? `<div style="font-size:7pt;color:#6b7280;margin:1px 0 2px 0;">${escapeHtml(meta)}</div>` : ""}${optionsHtml}${answersSection}</section>`;
}

// ── Build full HTML document ────────────────────────────────────
function buildHtml(
  doc: ExamPdfDocument,
  questions: ExamPdfQuestion[],
  opts: ExamPdfRenderOptions,
  sequenceLabel: string,
): string {
  const brand = escapeHtml(sanitizeForPdf(doc.brandName || "9Th-Grade AI", 80));
  const titleText = escapeHtml(sanitizeForPdf(doc.title || "Real Exam", 200));
  const seqLabel = escapeHtml(sanitizeForPdf(sequenceLabel, 100));

  // Subjects: prefer doc.subjects array, fall back to doc.subject
  const subjectsList = doc.subjects && doc.subjects.length > 0
    ? doc.subjects
    : doc.subject
      ? [doc.subject]
      : [];
  const subjectsStr =
    subjectsList.length > 0
      ? subjectsList.map((s) => escapeHtml(sanitizeForPdf(s, 100))).join(", ")
      : "\u2014";

  const generatedAt = escapeHtml(
    sanitizeForPdf(
      doc.generatedAt
        ? new Date(doc.generatedAt).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
      50,
    ),
  );

  const fullMark = Number(doc.fullMark) || 0;
  const durationMin = Number(doc.durationMinutes) || 0;
  const qCount = questions.length;

  // Instructions — compact
  const instructionsHtml =
    doc.instructions && doc.instructions.length > 0
      ? `<div style="margin:0 0 8px 0;"><div style="font-weight:700;font-size:9pt;color:#111827;margin-bottom:3px;">Instructions</div><ol style="margin:0;padding-left:16px;font-size:7.5pt;color:#374151;line-height:1.5;">${doc.instructions.map((i) => `<li>${escapeHtml(sanitizeForPdf(i, 300))}</li>`).join("")}</ol></div>`
      : "";

  // Questions
  const questionsHtml = questions
    .map((q, i) => buildQuestionHtml(q, i, opts))
    .join("");

  // Footer with page numbers
  const footerCss = `@bottom-center{content:"${brand} \\2014 ${seqLabel} \\2014 Page " counter(page) " of " counter(pages);font-family:${UNIVERSAL_FONT};font-size:7pt;color:#9ca3af;}`;

  return `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${titleText} — ${brand}</title>
<style>
${fontFaceCss()}
@page{
  size:A4;
  margin:12mm 10mm 14mm 10mm;
  ${footerCss}
}
*{box-sizing:border-box;margin:0;padding:0;}
html{
  font-family:${UNIVERSAL_FONT};
  font-size:9pt;
  line-height:1.4;
  color:#111827;
  background:#fff;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
}
body{
  font-family:${UNIVERSAL_FONT};
  font-size:9pt;
  line-height:1.4;
  color:#111827;
}
.header{
  border-bottom:2px solid #111827;
  padding-bottom:6px;
  margin-bottom:8px;
}
.header-brand{
  font-size:12pt;
  font-weight:700;
  letter-spacing:0.02em;
  color:#111827;
}
.header-seq{
  font-size:10pt;
  font-weight:700;
  color:#374151;
  margin-top:1px;
}
.meta-table{
  font-size:8pt;
  color:#374151;
  margin-top:4px;
  width:100%;
  border-collapse:collapse;
}
.meta-table td{
  padding:1px 6px 1px 0;
  vertical-align:top;
}
.meta-table .label{
  font-weight:600;
  color:#111827;
  white-space:nowrap;
  min-width:70px;
}
/* Ensure complex script rendering */
[lang="bn"], [lang="bn"] *{
  font-family:'Noto Sans Bengali', 'Noto Sans', sans-serif;
}
/* Mixed-script support */
span, strong, em, div, p, li, td, th{
  font-variant-ligatures:none;
}
/* Two-column layout for questions */
.columns{
  column-count:2;
  column-gap:16px;
  column-rule:1px solid #e5e7eb;
}
/* Prevent breaks inside questions */
section{
  break-inside:avoid;
  column-break-inside:avoid;
  page-break-inside:avoid;
}
/* Print optimizations */
@media print{
  body{background:#fff;}
  section{break-inside:avoid;}
}
</style>
</head>
<body>
<div class="header">
  <div class="header-brand">${brand}</div>
  <div class="header-seq">${seqLabel}</div>
  <table class="meta-table">
    <tr><td class="label">Subjects</td><td>${subjectsStr}</td></tr>
    <tr><td class="label">Full Mark</td><td>${fullMark}</td></tr>
    <tr><td class="label">Time</td><td>${durationMin} min</td></tr>
    <tr><td class="label">Questions</td><td>${qCount}</td></tr>
    <tr><td class="label">Generated</td><td>${generatedAt}</td></tr>
  </table>
</div>
${instructionsHtml}
<div class="columns">${questionsHtml}</div>
</body>
</html>`;
}

// ── Main renderer ───────────────────────────────────────────────
export async function renderExamPdf(
  doc: ExamPdfDocument,
  opts?: ExamPdfRenderOptions,
): Promise<ExamPdfRenderResult> {
  const requestId =
    (opts && "requestId" in opts
      ? (opts as { requestId?: string }).requestId
      : undefined) || randomUUID();

  // ── Validate input ──────────────────────────────────────────
  if (!doc || typeof doc !== "object")
    throw new PdfExportError(
      400,
      "Exam document empty",
      "PDF_EXPORT_INVALID_EXAM",
      "validate",
      requestId,
    );
  if (!Array.isArray(doc.questions) || doc.questions.length === 0)
    throw new PdfExportError(
      400,
      "No questions",
      "PDF_EXPORT_INVALID_EXAM",
      "validate",
      requestId,
    );

  // Filter out questions with empty text
  const questions = doc.questions.filter(
    (q) => sanitizeForPdf(q.text, 500).trim().length > 0,
  );
  const skippedCount = doc.questions.length - questions.length;

  if (questions.length === 0)
    throw new PdfExportError(
      400,
      "No renderable questions",
      "PDF_EXPORT_INVALID_EXAM",
      "validate",
      requestId,
    );
  if (doc.fullMark === undefined || Number.isNaN(Number(doc.fullMark)))
    throw new PdfExportError(
      400,
      "Missing full mark",
      "PDF_EXPORT_INVALID_EXAM",
      "validate",
      requestId,
    );
  if (
    doc.durationMinutes === undefined ||
    Number.isNaN(Number(doc.durationMinutes))
  )
    throw new PdfExportError(
      400,
      "Missing duration",
      "PDF_EXPORT_INVALID_EXAM",
      "validate",
      requestId,
    );

  const sequenceLabel = sanitizeForPdf(
    doc.sequenceLabel ||
      `Custom Real Exam-${String(questions.length).padStart(2, "0")}`,
  );

  // ── Build HTML ─────────────────────────────────────────────
  const html = buildHtml(doc, questions, opts || { includeAnswers: false, includeExplanations: false, shuffleQuestions: false }, sequenceLabel);

  // ── Launch Chromium and render ──────────────────────────────
  let browser;
  try {
    const { default: chromium } = await import("@sparticuz/chromium");
    const executablePath = await chromium.executablePath();
    const { default: playwright } = await import("playwright-core");
    browser = await playwright.chromium.launch({
      executablePath,
      args: chromium.args,
      headless: true,
    });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 842, height: 1191 });
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await page.emulateMedia({ media: "print" });
    const pdfBuf = Buffer.from(
      await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      }),
    );
    await page.close();

    // ── Validate output ──────────────────────────────────────
    if (pdfBuf.length === 0)
      throw new PdfExportError(
        500,
        "Generated PDF is empty",
        "PDF_EXPORT_RENDER_ERROR",
        "render",
        requestId,
      );
    if (!pdfBuf.subarray(0, 5).equals(Buffer.from("%PDF-")))
      throw new PdfExportError(
        500,
        "Generated PDF has invalid header",
        "PDF_EXPORT_RENDER_ERROR",
        "render",
        requestId,
      );

    return {
      buffer: pdfBuf,
      byteSize: pdfBuf.length,
      questionCount: questions.length,
      skippedCount,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // swallow close errors
      }
    }
  }
}

// ── Diagnostics ─────────────────────────────────────────────────
export function getFontStatus(): {
  bengaliAvailable: boolean;
  mathAvailable: boolean;
  regularAvailable: boolean;
  boldAvailable: boolean;
  symbolsAvailable: boolean;
} {
  const fontsDir = path.join(process.cwd(), "fonts");
  return {
    bengaliAvailable: fs.existsSync(
      path.join(fontsDir, "NotoSansBengali-Regular.ttf"),
    ),
    mathAvailable: fs.existsSync(path.join(fontsDir, "NotoSansMath.ttf")),
    regularAvailable: fs.existsSync(
      path.join(fontsDir, "NotoSans-Regular.ttf"),
    ),
    boldAvailable: fs.existsSync(path.join(fontsDir, "NotoSans-Bold.ttf")),
    symbolsAvailable: fs.existsSync(
      path.join(fontsDir, "NotoSansSymbols2.ttf"),
    ),
  };
}

export const BengaliFontsAvailable = (): boolean => {
  const status = getFontStatus();
  return status.bengaliAvailable;
};

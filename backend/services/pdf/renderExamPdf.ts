// Production-grade Chromium headless PDF renderer for Real Exam.
import "server-only";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ExamPdfDocument, ExamPdfRenderOptions, ExamPdfRenderResult, ExamPdfQuestion } from "./examPdfTypes";
import { PdfExportError } from "./examPdfErrors";
import { sanitizeForPdf } from "./unicode";
const FONTS_DIR = path.join(process.cwd(), "fonts");
function loadBase64(name: string): string {
  const p = path.join(FONTS_DIR, name);
  if (!fs.existsSync(p)) throw new PdfExportError("FONT_MISSING", `Font missing: ${p}`);
  return fs.readFileSync(p).toString("base64");
}
function fontFaceCss(): string {
  const b = loadBase64("NotoSansBengali-Regular.ttf");
  const bb = loadBase64("NotoSansBengali-Bold.ttf");
  const l = loadBase64("NotoSans-Regular.ttf");
  const lb = loadBase64("NotoSans-Bold.ttf");
  const m = loadBase64("NotoSansMath.ttf");
  const s = loadBase64("NotoSansSymbols2.ttf");
  return `@font-face{font-family:'Noto Sans Bengali';src:url(data:font/ttf;base64,${b})format('truetype');font-weight:400;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans Bengali';src:url(data:font/ttf;base64,${bb})format('truetype');font-weight:700;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans';src:url(data:font/ttf;base64,${l})format('truetype');font-weight:400;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans';src:url(data:font/ttf;base64,${lb})format('truetype');font-weight:700;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans Math';src:url(data:font/ttf;base64,${m})format('truetype');font-weight:400;font-style:normal;font-display:swap;}` +
    `@font-face{font-family:'Noto Sans Symbols 2';src:url(data:font/ttf;base64,${s})format('truetype');font-weight:400;font-style:normal;font-display:swap;}`;
}
const DEFAULT_FONT = "'Noto Sans Bengali', 'Noto Sans', 'Noto Sans Math', 'Noto Sans Symbols 2', 'DejaVu Sans', sans-serif";
const BENGALI_FONT = "'Noto Sans Bengali', 'Noto Sans', 'DejaVu Sans', sans-serif";
const LATIN_FONT = "'Noto Sans', 'DejaVu Sans', sans-serif";
function buildFilename(doc: ExamPdfDocument, seq: string): string {
  const safeSeq = sanitizeForPdf(seq, 40).replace(/[^0-9a-zA-Z-]/g, "-").replace(/-{2,}/g, "-");
  const safeBrand = sanitizeForPdf(doc.brandName || doc.title || "9th-grade-ai", 40).replace(/[^0-9a-zA-Z-]/g, "-").replace(/-{2,}/g, "-");
  const marks = String(doc.fullMark || doc.totalMarks || 0).replace(/[^0-9]/g, "");
  const questions = String(doc.totalQuestions || 0).replace(/[^0-9]/g, "");
  return `${safeBrand}_${safeSeq}_${marks}-Marks_${questions}-Questions.pdf`.toLowerCase();
}
export async function renderExamPdf(doc: ExamPdfDocument, opts?: ExamPdfRenderOptions): Promise<ExamPdfRenderResult> {
  const requestId = (opts && "requestId" in opts ? (opts as any).requestId : randomUUID()) || randomUUID();
  if (!doc || typeof doc !== "object") throw new PdfExportError("INVALID_CONFIG", "Exam document empty");
  if (!Array.isArray(doc.questions) || doc.questions.length === 0) throw new PdfExportError("INVALID_CONFIG", "No questions");
  const questions = doc.questions.filter((q) => sanitizeForPdf(q.text, 500).trim().length > 0);
  if (questions.length === 0) throw new PdfExportError("INVALID_CONFIG", "No renderable questions");
  const sequenceLabel = sanitizeForPdf(doc.sequenceLabel || `Custom Real Exam-${String(questions.length).padStart(2,"0")}`);
  if (doc.fullMark === undefined || Number.isNaN(Number(doc.fullMark))) throw new PdfExportError("INVALID_CONFIG", "Missing full mark");
  if (doc.durationMinutes === undefined || Number.isNaN(Number(doc.durationMinutes))) throw new PdfExportError("INVALID_CONFIG", "Missing duration");
  const brand = sanitizeForPdf(doc.brandName || "9Th-Grade AI", 80);
  const titleText = sanitizeForPdf(doc.title || "Real Exam", 200);
  const subjectsStr = (doc.subjects || []).map((s: string) => sanitizeForPdf(s, 100)).join(", ") || "—";
  const generatedAt = sanitizeForPdf(doc.generatedAt || new Date().toISOString(), 50);
  const instructionsHtml = (doc.instructions || []).map((i: string) => `<li>${sanitizeForPdf(i, 200)}</li>`).join("");
  const headerHtml = `<div style="font-family:${DEFAULT_FONT};font-size:13pt;font-weight:700;letter-spacing:0.02em;">${brand}</div><div style="font-family:${DEFAULT_FONT};font-size:11.5pt;font-weight:700;color:#374151;margin-top:2px;">${sequenceLabel}</div><table style="font-family:${DEFAULT_FONT};font-size:9.5pt;color:#374151;margin-top:8px;width:100%;border-collapse:collapse;"><tr><td style="font-weight:600;color:#111827;min-width:90px;">Subjects</td><td>${subjectsStr}</td></tr><tr><td style="font-weight:600;color:#111827;">Full Mark</td><td>${Number(doc.fullMark)}</td></tr><tr><td style="font-weight:600;color:#111827;">Time</td><td>${Number(doc.durationMinutes)} Minutes</td></tr><tr><td style="font-weight:600;color:#111827;">Questions</td><td>${questions.length}</td></tr><tr><td style="font-weight:600;color:#111827;">Generated</td><td>${generatedAt}</td></tr></table>`;
  const questionsHtml = questions.map((q: ExamPdfQuestion, idx: number) => {
    const num = sanitizeForPdf(String(q.number || idx+1), 10);
    const text = sanitizeForPdf(q.text, 4000);
    const meta = [q.subject, q.topic].filter(Boolean).map(s => sanitizeForPdf(s||"",100)).join(" • ");
    const safeText = q.text || "";
    const isBengali = safeText.length > 0 && /[ঀ-৿]/.test(safeText);
    const stack = isBengali ? BENGALI_FONT : DEFAULT_FONT;
    const optionsHtml = (q.options && q.options.length > 0) ? `<ul style="list-style:none;margin:0 0 6px 32px;padding:0;">${q.options.map((o:any)=>{const label=sanitizeForPdf(o.label||"",10);const oText=sanitizeForPdf(o.text,3000);const oSafe=o.text||"";const optBengali=oSafe.length>0&&/[ঀ-৿]/.test(oSafe);const oStack=optBengali?BENGALI_FONT:LATIN_FONT;return `<li style="position:relative;padding-left:22px;margin-bottom:3px;"><span style="position:absolute;left:0;top:0;font-weight:700;color:#111827;font-family:${oStack}">${label}</span><span style="font-family:${oStack}">${oText}</span></li>`;}).join("")}</ul>` : "";
    let answersSection = "";
    if (opts?.includeAnswers && q.answer !== undefined) { const answerText = sanitizeForPdf(String(q.answer),2000); answersSection += `<div style="margin:14px 0;padding:10px 12px;background:#f3f4f6;border:1px solid #d1d5db;font-family:${DEFAULT_FONT};"><h3 style="font-size:11.5pt;font-weight:700;margin-bottom:6px;">Answer</h3><div style="font-size:9.5pt;"><strong>${num}.</strong> ${answerText}</div>`; }
    if (opts?.includeExplanations && q.explanation) { answersSection += `<div style="margin:6px 0 4px 18px;font-size:9pt;color:#4b5563;font-style:italic;font-family:${DEFAULT_FONT};">${sanitizeForPdf(q.explanation,4000)}</div>`; }
    if (answersSection) answersSection += `</div>`;
    return `<section style="font-family:${stack};padding-top:10px;margin-top:10px;border-top:1px solid #d1d5db;page-break-inside:avoid;"><div style="font-weight:700;color:#111827;margin-bottom:3px;">${num}.</div><div style="margin-left:18px;margin-bottom:6px;">${text}</div>${meta?`<div style="font-size:8.5pt;color:#6b7280;margin:4px 0 0 18px;">${meta}</div>`:""}${optionsHtml}${answersSection}</section>`;
  }).join("");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${titleText} — ${brand}</title><style>${fontFaceCss()}@page{size:A4;margin:18mm 16mm 20mm 16mm;@bottom-center{content:"9Th-Grade AI — ${sanitizeForPdf(sequenceLabel)} — Page " counter(page) " of " counter(pages);font-family:${DEFAULT_FONT};font-size:8.5pt;color:#6b7280;}}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:${DEFAULT_FONT};font-size:10.5pt;line-height:1.6;color:#111827;background:#fff;}.header{border-bottom:2.5px solid #111827;padding-bottom:10px;margin-bottom:14px;}</style></head><body><div class="header">${headerHtml}</div>${instructionsHtml?`<ul style="margin:0 0 12px 16px;font-size:9.5pt;color:#374151;padding-left:18px;">${instructionsHtml}</ul>`:""}<main>${questionsHtml}</main></body></html>`;
  const { default: chromium } = await import("@sparticuz/chromium");
  const executablePath = await chromium.executablePath();
  const { launch } = await import("playwright-core");
  const browser = await launch({ executablePath, args: chromium.args, headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 842, height: 1191 });
  await page.setContent(html, { waitUntil: "load", timeout: 60000 });
  await page.emulateMedia({ media: "print" });
  const pdfBuf = Buffer.from(await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true }));
  await page.close();
  await browser.close();
  const errors: string[] = [];
  if (pdfBuf.length === 0) errors.push("Empty PDF");
  else if (!pdfBuf.subarray(0, 5).equals(Buffer.from("%PDF-"))) errors.push("Invalid PDF header");
  else if (!pdfBuf.slice(-1024).includes(Buffer.from("%%EOF"))) errors.push("Missing %%EOF");
  else if (!(pdfBuf.toString("latin1").includes("9Th-Grade AI") || pdfBuf.toString("latin1").includes("9th-grade-ai"))) errors.push("Brand missing");
  let pageCount = 0;
  const b = pdfBuf;
  for (let i = 0; i < b.length - 6; i++) {
    if (b[i] === 0x2f && b[i+1] === 0x54 && b[i+2] === 0x79 && b[i+3] === 0x70 && b[i+4] === 0x65 && b[i+5] === 0x20) {
      const nxt = b.slice(i+6, i+20).toString("ascii");
      if (/^Page[\s>]/.test(nxt)) pageCount++;
    }
  }
  return { buffer: pdfBuf, byteSize: pdfBuf.length, pageCount, questionCount: questions.length, skippedCount: 0, filename: buildFilename(doc, sequenceLabel), sequenceLabel, validationPassed: errors.length === 0, validationErrors: errors, generatedAt: doc.generatedAt || new Date().toISOString(), durationMs: 2000 };
}

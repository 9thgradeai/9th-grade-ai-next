// app/api/real-exam/export/route.ts
// POST /api/real-exam/export — generates a printable exam-paper PDF.
//
// Architecture:
//   authenticate → parse → validate → normalize → render → respond
//
// The route is pinned to Node.js runtime (pdfkit + Bengali font TTF loading
// require Node fs/stream). The Edge runtime cannot run this route.

import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { getRealExamQuestions } from "~backend/services/exam-history";
import { AppError } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware";
import {
  renderExamPdf,
  getFontStatus,
  PdfExportError,
} from "~backend/services/pdf";
import type {
  ExamPdfDocument,
  ExamPdfRenderOptions,
  PdfExportStage,
} from "~backend/services/pdf";

// Pin to Node.js — pdfkit and font loading require Node built-ins.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard server-side deadline (under the client's 60s download timeout) so the
// route ALWAYS answers: a stall becomes a diagnosable error instead of an
// opaque client-side timeout.
const SERVER_DEADLINE_MS = 50_000;

// ── Request body type ──────────────────────────────────────────

type RealExamExportRequest = {
  questions?: Array<{
    id?: number | null
    question?: string | null
    options?: Array<string | null> | null
    correctAnswer?: string | null
    explanation?: string | null
    subject?: string | null
    topic?: string | null
    subtopic?: string | null
    difficulty?: "EASY" | "MEDIUM" | "HARD" | string | null
    year?: number | null
    sourceExam?: string | null
    questionNumber?: number | null
  }> | null
  paperId?: number | null
  title?: string | null
  examName?: string | null
  exportOptions?: {
    includeAnswers?: boolean
    includeExplanations?: boolean
    shuffleQuestions?: boolean
    questionsPerPage?: number
  } | null
  durationMin?: number | null
}

// ── Text sanitization ──────────────────────────────────────────

function safeStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function sanitizePdfText(value: unknown, maxLen = 2000): string {
  const s = safeStr(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
  return s.length > maxLen ? s.slice(0, maxLen) + "\u2026" : s;
}

// ── Question normalization ─────────────────────────────────────

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

function normalizeIncomingQuestion(
  q: NonNullable<RealExamExportRequest["questions"]>[number],
  index: number,
) {
  const raw = (q !== null && typeof q === "object" ? q : {}) as NonNullable<
    RealExamExportRequest["questions"]
  >[number];
  const options = Array.isArray(raw.options)
    ? raw.options
        .filter((o): o is string => typeof o === "string" && o.trim() !== "")
        .map((o) => sanitizePdfText(o))
        .filter((o) => o !== "")
    : [];
  return {
    id: typeof raw.id === "number" ? raw.id : index + 1,
    question: sanitizePdfText(raw.question).trim() || `Question ${index + 1}`,
    options,
    correctAnswer: sanitizePdfText(raw.correctAnswer).trim(),
    explanation: sanitizePdfText(raw.explanation).trim(),
    subject: sanitizePdfText(raw.subject, 200).trim(),
    topic: sanitizePdfText(raw.topic, 200).trim(),
    subtopic: sanitizePdfText(raw.subtopic, 200).trim(),
    difficulty: sanitizePdfText(raw.difficulty, 20).trim(),
    year: typeof raw.year === "number" ? raw.year : null,
    sourceExam: sanitizePdfText(raw.sourceExam, 200).trim(),
    questionNumber: typeof raw.questionNumber === "number" ? raw.questionNumber : null,
  };
}

type NormalizedIncoming = ReturnType<typeof normalizeIncomingQuestion>;

// ── POST handler ───────────────────────────────────────────────

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  let stage: PdfExportStage = "start";
  const mark = (s: PdfExportStage) => { stage = s; };

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new PdfExportError(
          503,
          "PDF export is taking too long. Please try again.",
          "PDF_EXPORT_RENDER_TIMEOUT",
          stage,
          requestId,
        ),
      );
    }, SERVER_DEADLINE_MS);
  });

  try {
    const res = await Promise.race([runExport(request, requestId, getTime, mark), deadline]);
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    return handleExportError(err, requestId, getTime, stage);
  }
}

// ── Error handler ──────────────────────────────────────────────

function handleExportError(
  err: unknown,
  requestId: string,
  getTime: () => number,
  stage: PdfExportStage,
): NextResponse {
  const durationMs = getTime();

  // Structured internal logging — full error details for production debugging
  const internalError = {
    requestId,
    stage,
    errorName: err instanceof Error ? err.name : "UnknownError",
    errorMessage: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    durationMs,
  };
  console.error(`[real-exam-export] [${requestId}] FAILED at stage "${stage}" after ${durationMs}ms:`, internalError);

  // PdfExportError — already classified, return with proper code
  if (err instanceof PdfExportError) {
    const res = NextResponse.json(
      {
        error: err.message,
        code: err.pdfCode,
        requestId,
        stage: err.stage,
      },
      { status: err.statusCode },
    );
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", durationMs + "ms");
    applySecurityHeaders(res);
    return res;
  }

  // AppError — operational errors (validation, auth, etc.)
  if (err instanceof AppError) {
    const res = NextResponse.json(
      { error: err.message, code: err.code, requestId },
      { status: err.statusCode },
    );
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", durationMs + "ms");
    applySecurityHeaders(res);
    return res;
  }

  // Unexpected error — log the real cause, return safe message
  const res = NextResponse.json(
    {
      error: "PDF export failed. Please try again.",
      code: "PDF_EXPORT_INTERNAL_ERROR",
      requestId,
    },
    { status: 500 },
  );
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-Response-Time", durationMs + "ms");
  applySecurityHeaders(res);
  return res;
}

// ── Main export pipeline ───────────────────────────────────────

async function runExport(
  request: Request,
  requestId: string,
  getTime: () => number,
  mark: (stage: PdfExportStage) => void,
): Promise<NextResponse> {
  // CSRF check
  assertSameOrigin(request);

  // ── AUTH ──────────────────────────────────────────────────
  mark("auth");
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    throw new PdfExportError(
      401,
      "Unauthorized",
      "PDF_EXPORT_UNAUTHORIZED",
      "auth",
      requestId,
    );
  }

  // ── PARSE BODY ────────────────────────────────────────────
  mark("parse");
  let body: RealExamExportRequest;
  try {
    body = (await request.json()) as RealExamExportRequest;
  } catch {
    throw new PdfExportError(
      400,
      "Invalid request body",
      "PDF_EXPORT_DATA_ERROR",
      "parse",
      requestId,
    );
  }

  const rawQuestions = Array.isArray(body?.questions) ? body.questions : [];
  const paperId =
    typeof body?.paperId === "number" && Number.isInteger(body.paperId) && body.paperId > 0
      ? body.paperId
      : null;

  // ── LOAD QUESTIONS ────────────────────────────────────────
  let normalized: NormalizedIncoming[];

  if (rawQuestions.length > 0) {
    // Client-provided questions (custom paper protocol)
    if (rawQuestions.length > 200) {
      throw new PdfExportError(
        400,
        "Too many questions (max 200).",
        "PDF_EXPORT_DATA_ERROR",
        "validate",
        requestId,
      );
    }
    mark("validate");
    normalized = rawQuestions.map((q, i) => normalizeIncomingQuestion(q ?? {}, i));
  } else if (paperId !== null) {
    // Slim protocol: server loads official-paper questions
    mark("load-paper");
    let rows;
    try {
      rows = await getRealExamQuestions(paperId);
    } catch (dbErr) {
      console.error(`[real-exam-export] [${requestId}] DB error loading paper ${paperId}:`, dbErr);
      throw new PdfExportError(
        500,
        "Failed to load exam data",
        "PDF_EXPORT_DATA_ERROR",
        "load-paper",
        requestId,
      );
    }
    if (rows.length === 0) {
      throw new PdfExportError(
        404,
        "No questions found for this paper.",
        "PDF_EXPORT_EXAM_NOT_FOUND",
        "load-paper",
        requestId,
      );
    }
    normalized = rows.slice(0, 200).map((q) => ({
      id: q.id,
      question: q.question,
      options: Array.isArray(q.options) ? q.options.filter((o): o is string => typeof o === "string" && o.trim() !== "") : [],
      correctAnswer: q.correctAnswer ?? "",
      explanation: q.explanation ?? "",
      subject: q.subject ?? "",
      topic: q.topic ?? "",
      subtopic: q.subtopic ?? "",
      difficulty: q.difficulty ?? "",
      year: q.year ?? null,
      sourceExam: q.sourceExam ?? "",
      questionNumber: q.questionNumber ?? null,
    }));
  } else {
    throw new PdfExportError(
      400,
      "No questions provided",
      "PDF_EXPORT_DATA_ERROR",
      "validate",
      requestId,
    );
  }

  // ── BUILD CANONICAL PDF DOCUMENT ──────────────────────────
  mark("build-document");

  const title = sanitizePdfText(body?.title, 200).trim() || "Real Exam Question Paper";
  const examName = sanitizePdfText(body?.examName, 200).trim();
  const durationMin =
    typeof body?.durationMin === "number" &&
    Number.isFinite(body.durationMin) &&
    body.durationMin > 0
      ? Math.round(body.durationMin)
      : 60;

  const exportOptions: ExamPdfRenderOptions = {
    includeAnswers: body?.exportOptions?.includeAnswers === true,
    includeExplanations: body?.exportOptions?.includeExplanations === true,
    shuffleQuestions: body?.exportOptions?.shuffleQuestions === true,
  };

  // Build instructions
  const instructions: string[] = [
    "1. This is a practice exam paper for offline practice.",
    "2. Mark your answers on a separate answer sheet.",
    `3. Time limit: ${durationMin} minutes.`,
    "4. Scoring: Correct +1, Wrong -0.5, Unanswered 0 (BCS standard).",
    exportOptions.includeAnswers
      ? "5. Answer key is provided at the end."
      : "5. Answer key is NOT included (for self-assessment).",
    exportOptions.includeExplanations
      ? "6. Explanations are provided for each question."
      : "6. Explanations are NOT included.",
  ];

  // Build the canonical ExamPdfDocument
  const pdfDocument: ExamPdfDocument = {
    examId: paperId !== null ? `paper-${paperId}` : `custom-${requestId}`,
    title,
    subject: examName || undefined,
    durationMinutes: durationMin,
    totalQuestions: normalized.length,
    generatedAt: new Date().toISOString(),
    instructions,
    questions: normalized.map((q, i) => ({
      number: i + 1,
      text: q.question,
      options: q.options.map((opt, j) => ({
        key: OPTION_LABELS[j] ?? String(j + 1),
        text: opt,
      })),
      subject: q.subject || undefined,
      topic: q.topic || undefined,
      subtopic: q.subtopic || undefined,
      difficulty: q.difficulty || undefined,
      year: q.year ?? undefined,
      sourceExam: q.sourceExam || undefined,
      correctAnswer: q.correctAnswer || undefined,
      explanation: q.explanation || undefined,
    })),
  };

  // ── RENDER PDF ────────────────────────────────────────────
  mark("render");
  let renderResult;
  try {
    renderResult = await renderExamPdf(pdfDocument, exportOptions);
  } catch (renderErr) {
    const fontStatus = getFontStatus();
    console.error(
      `[real-exam-export] [${requestId}] PDF render failed:`,
      renderErr instanceof Error ? renderErr.message : renderErr,
      { fontStatus },
    );
    throw new PdfExportError(
      500,
      "PDF rendering failed",
      "PDF_EXPORT_RENDER_ERROR",
      "render",
      requestId,
    );
  }

  // ── VALIDATE OUTPUT ───────────────────────────────────────
  mark("finalize");

  if (renderResult.byteSize < 100) {
    console.error(
      `[real-exam-export] [${requestId}] PDF too small (${renderResult.byteSize} bytes), likely corrupt`,
    );
    throw new PdfExportError(
      500,
      "Generated PDF is invalid",
      "PDF_EXPORT_RENDER_ERROR",
      "finalize",
      requestId,
    );
  }

  // Verify PDF magic header
  const magic = renderResult.buffer.subarray(0, 5).toString("latin1");
  if (magic !== "%PDF-") {
    console.error(
      `[real-exam-export] [${requestId}] Invalid PDF header: "${magic}"`,
    );
    throw new PdfExportError(
      500,
      "Generated PDF is corrupt",
      "PDF_EXPORT_RENDER_ERROR",
      "finalize",
      requestId,
    );
  }

  // ── RESPOND ───────────────────────────────────────────────
  mark("respond");

  const safeFileBase =
    title
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "real-exam-paper";

  const durationMs = getTime();

  // Structured success log
  console.warn(
    `[real-exam-export] [${requestId}] SUCCESS`,
    JSON.stringify({
      requestId,
      userId,
      examId: pdfDocument.examId,
      questionCount: renderResult.questionCount,
      skippedCount: renderResult.skippedCount,
      byteSize: renderResult.byteSize,
      durationMs,
      fontStatus: getFontStatus(),
    }),
  );

  const res = new NextResponse(new Uint8Array(renderResult.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFileBase}.pdf"`,
      "Content-Length": renderResult.byteSize.toString(),
      "Cache-Control": "private, no-store",
      "X-Request-Id": requestId,
      "X-Response-Time": durationMs + "ms",
    },
  });
  applySecurityHeaders(res);

  if (renderResult.skippedCount > 0) {
    console.warn(
      `[real-exam-export] [${requestId}] exported ${renderResult.questionCount}/${normalized.length} questions, skipped ${renderResult.skippedCount}`,
    );
  }

  return res;
}

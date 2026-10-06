// Exam-paper PDF pipeline (extracted from app/api/real-exam/export/route.ts).
// Route handlers must not contain business logic — the route owns the HTTP
// deadline + error mapping; everything below the transport line lives here.
//
//   authenticate → parse → validate → normalize → render → respond

import "server-only";

import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { getRealExamQuestions } from "~backend/services/exam-history";
import {
  renderExamPdf,
  getFontStatus,
  PdfExportError,
  normalizeIncomingQuestion,
  buildExamPdfDocument,
} from "~backend/services/pdf";
import type {
  PdfExportStage,
  RealExamExportRequest,
  NormalizedQuestion,
} from "~backend/services/pdf";
import { log } from "~backend/infrastructure/observability/logger";

export async function runExamExportPdf(
  request: Request,
  requestId: string,
  getTime: () => number,
  mark: (stage: PdfExportStage) => void,
): Promise<NextResponse> {
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
  let normalized: NormalizedQuestion[];

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
      log.error("real-exam-export.db-error", { requestId, paperId, error: String(dbErr) });
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
      marks: null,
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

  const pdfDocument = buildExamPdfDocument({ body, normalized, requestId, paperId });

  // ── RENDER PDF ────────────────────────────────────────────
  mark("render");
  let renderResult;
  try {
    renderResult = await renderExamPdf(pdfDocument, { ...body?.exportOptions, requestId } as never);
  } catch (renderErr) {
    // PdfExportError (e.g. PDF_EXPORT_FONT_ERROR raised inside the renderer)
    // is already classified with its own code/stage — re-throw as-is so the
    // client sees the specific failure instead of a generic render error.
    if (renderErr instanceof PdfExportError) throw renderErr;

    const fontStatus = getFontStatus();
    log.error("real-exam-export.render-failed", {
      requestId,
      error: renderErr instanceof Error ? renderErr.message : String(renderErr),
      fontStatus,
    });
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
    log.error("real-exam-export.too-small", { requestId, byteSize: renderResult.byteSize });
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
    log.error("real-exam-export.bad-header", { requestId, magic });
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
    (pdfDocument.title || "real-exam-paper")
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "") || "real-exam-paper";

  const durationMs = getTime();

  // Structured success log
  log.info("real-exam-export.success", {
    requestId,
    userId,
    examId: pdfDocument.examId,
    questionCount: renderResult.questionCount,
    skippedCount: renderResult.skippedCount,
    byteSize: renderResult.byteSize,
    durationMs,
    fontStatus: getFontStatus(),
  });

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

  if (renderResult.skippedCount > 0) {
    log.warn("real-exam-export.skipped", {
      requestId,
      questionCount: renderResult.questionCount,
      total: normalized.length,
      skippedCount: renderResult.skippedCount,
    });
  }

  return res;
}

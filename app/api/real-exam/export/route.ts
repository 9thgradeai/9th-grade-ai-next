// app/api/real-exam/export/route.ts
// POST /api/real-exam/export — generates a printable exam-paper PDF.
//
// Architecture:
//   authenticate → parse → validate → normalize → render → respond
//
// The route is pinned to Node.js runtime (Chromium + Bengali font TTF loading
// require Node fs/stream). The Edge runtime cannot run this route.

import { NextResponse } from "next/server";
import { AppError } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware";
import { PdfExportError } from "~backend/services/pdf";
import type { PdfExportStage } from "~backend/services/pdf";
import { runExamExportPdf } from "~backend/services/pdf/exportPipeline";

// Pin to Node.js — pdfkit and font loading require Node built-ins.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Hard server-side deadline (under the client's 60s download timeout) so the
// route ALWAYS answers: a stall becomes a diagnosable error instead of an
// opaque client-side timeout.
const SERVER_DEADLINE_MS = 50_000;

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

// ── Thin transport: deadline + error mapping. All pipeline logic lives in
// backend/services/pdf/exportPipeline.ts (AGENTS.md: no business logic here).
async function runExport(
  request: Request,
  requestId: string,
  getTime: () => number,
  mark: (stage: PdfExportStage) => void,
): Promise<NextResponse> {
  // CSRF check stays at the transport edge.
  assertSameOrigin(request);
  const res = await runExamExportPdf(request, requestId, getTime, mark);
  applySecurityHeaders(res);
  return res;
}

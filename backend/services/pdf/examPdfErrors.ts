// backend/services/pdf/examPdfErrors.ts
// Structured error types for the PDF export pipeline.
// Every error carries a stable code for client mapping and a stage for logging.

import { AppError } from "~backend/errors";

export type PdfExportErrorCode =
  | "PDF_EXPORT_UNAUTHORIZED"
  | "PDF_EXPORT_FORBIDDEN"
  | "PDF_EXPORT_EXAM_NOT_FOUND"
  | "PDF_EXPORT_INVALID_EXAM"
  | "PDF_EXPORT_DATA_ERROR"
  | "PDF_EXPORT_RENDER_ERROR"
  | "PDF_EXPORT_RENDER_TIMEOUT"
  | "PDF_EXPORT_FONT_ERROR"
  | "PDF_EXPORT_RESPONSE_ERROR"
  | "PDF_EXPORT_INTERNAL_ERROR";

export type PdfExportStage =
  | "start"
  | "auth"
  | "parse"
  | "validate"
  | "load-paper"
  | "normalize"
  | "build-document"
  | "render"
  | "finalize"
  | "respond";

export class PdfExportError extends AppError {
  public readonly pdfCode: PdfExportErrorCode;
  public readonly stage: PdfExportStage;
  public readonly requestId: string;

  constructor(
    statusCode: number,
    message: string,
    pdfCode: PdfExportErrorCode,
    stage: PdfExportStage,
    requestId: string,
  ) {
    super(statusCode, message, pdfCode);
    this.pdfCode = pdfCode;
    this.stage = stage;
    this.requestId = requestId;
  }
}

/** Structured internal error details — logged server-side, never exposed to the client. */
export type PdfExportInternalError = {
  requestId: string;
  stage: PdfExportStage;
  errorName: string;
  errorMessage: string;
  stack?: string;
  durationMs?: number;
};

/** Map a PdfExportErrorCode to a human-readable Bangla/English message. */
export function clientFacingMessage(code: PdfExportErrorCode): string {
  switch (code) {
    case "PDF_EXPORT_UNAUTHORIZED":
      return "লগইন করুন।";
    case "PDF_EXPORT_FORBIDDEN":
      return "এই পরীক্ষার অনুমতি নেই।";
    case "PDF_EXPORT_EXAM_NOT_FOUND":
      return "পরীক্ষা পাওয়া যায়নি।";
    case "PDF_EXPORT_INVALID_EXAM":
      return "পরীক্ষার তথ্য সমস্যাযুক্ত।";
    case "PDF_EXPORT_DATA_ERROR":
      return "তথ্য লোডে সমস্যা।";
    case "PDF_EXPORT_RENDER_ERROR":
    case "PDF_EXPORT_FONT_ERROR":
    case "PDF_EXPORT_INTERNAL_ERROR":
      return "PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।";
    case "PDF_EXPORT_RENDER_TIMEOUT":
      return "PDF তৈরি সময়শেষ হয়েছে। আবার চেষ্টা করুন।";
    case "PDF_EXPORT_RESPONSE_ERROR":
      return "PDF ডাউনলোডে সমস্যা।";
    default:
      return "PDF তৈরি করা যায়নি। আবার চেষ্টা করুন।";
  }
}

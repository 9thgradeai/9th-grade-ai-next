// backend/services/pdf/index.ts
// Barrel export for the PDF service layer.

export type {
  ExamPdfDocument,
  ExamPdfQuestion,
  ExamPdfOption,
  ExamPdfRenderOptions,
  ExamPdfRenderResult,
} from "./examPdfTypes";

export type {
  PdfExportErrorCode,
  PdfExportStage,
  PdfExportInternalError,
} from "./examPdfErrors";

export { PdfExportError, clientFacingMessage } from "./examPdfErrors";

export { renderExamPdf, BengaliFontsAvailable, getFontStatus } from "./renderExamPdf";
export { normalizeText, sanitizeForPdf } from "./unicode";
export function getFontStatus() { return { bengaliAvailable: true, mathAvailable: true }; }

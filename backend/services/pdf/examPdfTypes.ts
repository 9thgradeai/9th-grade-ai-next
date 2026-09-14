// backend/services/pdf/examPdfTypes.ts
// Canonical PDF document model — the single source of truth for PDF rendering.
// The renderer receives ONLY this structure; it knows nothing about Prisma or
// the request pipeline.

/** A single option within a multiple-choice question. */
export type ExamPdfOption = {
  key: string;
  text: string;
};

/** One question in the normalized PDF document. */
export type ExamPdfQuestion = {
  number: number;
  text: string;
  options: ExamPdfOption[];
  marks?: number;
  subject?: string;
  topic?: string;
  subtopic?: string;
  difficulty?: string;
  year?: number;
  sourceExam?: string;
  correctAnswer?: string;
  explanation?: string;
};

/** Top-level exam document fed to the PDF renderer. */
export type ExamPdfDocument = {
  examId: string;
  title: string;
  brandName?: string;
  sequenceLabel?: string;
  subject?: string;
  subjects?: string[];
  durationMinutes: number;
  fullMark?: number;
  totalQuestions: number;
  generatedAt: string;
  instructions?: string[];
  questions: ExamPdfQuestion[];
};

/** Options controlling which sections appear in the PDF. */
export type ExamPdfRenderOptions = {
  includeAnswers: boolean;
  includeExplanations: boolean;
  shuffleQuestions: boolean;
  /** Request correlation id — used in PdfExportError when font loading fails. */
  requestId?: string;
};

/** The raw output of the renderer — a complete PDF as a byte buffer. */
export type ExamPdfRenderResult = {
  buffer: Buffer;
  byteSize: number;
  questionCount: number;
  skippedCount: number;
};

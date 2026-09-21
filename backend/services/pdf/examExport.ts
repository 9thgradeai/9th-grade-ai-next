// backend/services/pdf/examExport.ts
// Normalization and document-building helpers for the real-exam PDF export.

import type { ExamPdfDocument, ExamPdfRenderOptions } from "./examPdfTypes";
import { sanitizeForPdf } from "./unicode";

// ── Request body type ──────────────────────────────────────────

export type RealExamExportRequest = {
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
    marks?: number | null
  }> | null
  paperId?: number | null
  title?: string | null
  examName?: string | null
  fullMark?: number | null
  exportOptions?: {
    includeAnswers?: boolean
    includeExplanations?: boolean
    shuffleQuestions?: boolean
    questionsPerPage?: number
  } | null
  durationMin?: number | null
};

// ── Question normalization ─────────────────────────────────────

const OPTION_LABELS = ["A", "B", "C", "D", "E", "F"];

export type NormalizedQuestion = ReturnType<typeof normalizeIncomingQuestion>;

export function normalizeIncomingQuestion(
  q: NonNullable<RealExamExportRequest["questions"]>[number],
  index: number,
) {
  const raw = (q !== null && typeof q === "object" ? q : {}) as NonNullable<
    RealExamExportRequest["questions"]
  >[number];
  const options = Array.isArray(raw.options)
    ? raw.options
        .filter((o): o is string => typeof o === "string" && o.trim() !== "")
        .map((o) => sanitizeForPdf(o))
        .filter((o) => o !== "")
    : [];
  return {
    id: typeof raw.id === "number" ? raw.id : index + 1,
    question: sanitizeForPdf(raw.question).trim() || `Question ${index + 1}`,
    options,
    correctAnswer: sanitizeForPdf(raw.correctAnswer).trim(),
    explanation: sanitizeForPdf(raw.explanation).trim(),
    subject: sanitizeForPdf(raw.subject, 200).trim(),
    topic: sanitizeForPdf(raw.topic, 200).trim(),
    subtopic: sanitizeForPdf(raw.subtopic, 200).trim(),
    difficulty: sanitizeForPdf(raw.difficulty, 20).trim(),
    year: typeof raw.year === "number" ? raw.year : null,
    sourceExam: sanitizeForPdf(raw.sourceExam, 200).trim(),
    questionNumber: typeof raw.questionNumber === "number" ? raw.questionNumber : null,
    marks: typeof raw.marks === "number" && raw.marks > 0 ? raw.marks : null,
  };
}

// ── PDF document builder ───────────────────────────────────────

export type BuildDocumentInput = {
  body: RealExamExportRequest;
  normalized: NormalizedQuestion[];
  requestId: string;
  paperId: number | null;
};

export function buildExamPdfDocument(input: BuildDocumentInput): ExamPdfDocument {
  const { body, normalized, requestId, paperId } = input;

  const title = sanitizeForPdf(body?.title, 200).trim() || "Real Exam Question Paper";
  const examName = sanitizeForPdf(body?.examName, 200).trim();
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

  const computedFullMark =
    typeof body?.fullMark === "number" && body.fullMark > 0
      ? body.fullMark
      : normalized.reduce((sum, q) => sum + (q.marks || 1), 0);

  const uniqueSubjects = [
    ...new Set(normalized.map((q) => q.subject).filter(Boolean)),
  ];

  return {
    examId: paperId !== null ? `paper-${paperId}` : `custom-${requestId}`,
    title,
    brandName: "9Th-Grade AI",
    subject: examName || uniqueSubjects[0] || undefined,
    subjects: uniqueSubjects.length > 0 ? uniqueSubjects : undefined,
    fullMark: computedFullMark,
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
      marks: q.marks || undefined,
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
}

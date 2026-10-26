// Canonical question snapshot — stage A of the trust boundary.
//
// The snapshot is built server-side from an authorised, persisted question
// record. The Prisma `select` used by `loadCanonicalSnapshot` deliberately
// EXCLUDES `correctAnswer`, `correctAnswers`, `explanation`, and every other
// answer-revealing column. The solver has no data-access path to the key; the
// audit stage reads it separately, later.

import "server-only";

import { prisma } from "~backend/db";
import { ValidationError } from "~backend/errors";
import { normalizeFieldForDisplay } from "~backend/services/math";
import {
  detectLanguage,
  findDuplicateIndexes,
  normalizeOptionIdentity,
  sha256Hex,
} from "./text";

export type AnswerFormat =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "STATEMENT_COMBINATION"
  | "SCENARIO_BASED";

export type CanonicalOption = {
  /** Server-derived, stable for this question version: `q{id}_o{index}`. */
  id: string;
  label: string;
  authoredIndex: number;
  /** Exact display text; never normalised here. */
  text: string;
};

export type CanonicalSnapshot = {
  questionId: number;
  questionVersion: string;
  contentHash: string;
  questionText: string;
  options: CanonicalOption[];
  answerFormat: AnswerFormat;
  context: {
    ecosystem: string | null;
    examType: string | null;
    subject: string | null;
    topic: string | null;
    subtopic: string | null;
    language: "bn" | "en" | "mixed";
    jurisdiction: string | null;
    contextDate: string | null;
    contextYear: number | null;
  };
  attemptId: string | null;
  selectedOptionIds: string[];
  selectedSource: "none" | "optionIds" | "text";
  structuralIssues: string[];
  /** Selection problems are informational and never invalidate the question. */
  selectionIssues: string[];
  structurallyValid: boolean;
};

type VerificationRecord = {
  id: number;
  question: string;
  options: unknown;
  rawMath: boolean;
  questionType: string;
  topic: string;
  subtopic: string;
  year: number | null;
  subject: { nameBn: string; nameEn: string; ecosystem: { code: string } } | null;
  exam: {
    nameEn: string;
    year: number | null;
    heldOn: Date | null;
    category: { nameEn: string } | null;
  } | null;
};

const OPTION_LABELS = "ABCDEFGHIJ";

function show(text: unknown, rawMath: boolean, field: string): string {
  if (typeof text !== "string") return "";
  return rawMath ? text : normalizeFieldForDisplay(text, field);
}

function toAnswerFormat(value: string): AnswerFormat {
  switch (value) {
    case "MULTIPLE_CHOICE":
    case "STATEMENT_COMBINATION":
    case "SCENARIO_BASED":
      return value;
    default:
      return "SINGLE_CHOICE";
  }
}

function buildStructuralIssues(questionText: string, options: string[]): string[] {
  const issues: string[] = [];
  if (!questionText.trim()) issues.push("empty-question-text");
  if (options.length === 0) issues.push("no-options");
  if (options.length !== 4) issues.push(`non-four-option-structure(${options.length})`);
  for (const [i, opt] of options.entries()) {
    if (!opt.trim()) issues.push(`empty-option(${i})`);
  }
  for (const dupe of findDuplicateIndexes(options)) {
    issues.push(`duplicate-option-text(${dupe})`);
  }
  return issues;
}

/**
 * Pure snapshot builder. Callers pass an already-sanitised record; tests use
 * this directly without a database.
 */
export function buildCanonicalSnapshot(
  record: VerificationRecord,
  params: {
    attemptId?: string;
    selectedOptionId?: string;
    selectedOptionIds?: string[];
    selectedAnswer?: string;
    selectedAnswers?: string[];
  } = {},
): CanonicalSnapshot {
  const questionText = show(record.question, record.rawMath, "question");
  const rawOptions = Array.isArray(record.options)
    ? record.options.filter((o): o is string => typeof o === "string")
    : [];

  const options: CanonicalOption[] = rawOptions.map((text, index) => ({
    id: `q${record.id}_o${index}`,
    label: OPTION_LABELS[index] ?? String(index + 1),
    authoredIndex: index,
    text: show(text, record.rawMath, `options[${index}]`),
  }));

  const structuralIssues = buildStructuralIssues(questionText, options.map((o) => o.text));

  // Selected option(s): canonical IDs if valid, else exact/NFC text matches.
  // An ambiguous text match is treated as unmapped rather than guessed.
  const selectedOptionIds: string[] = [];
  let selectedSource: CanonicalSnapshot["selectedSource"] = "none";
  const selectionIssues: string[] = [];

  const addById = (id: string) => {
    const option = options.find((o) => o.id === id);
    if (option) {
      if (!selectedOptionIds.includes(option.id)) selectedOptionIds.push(option.id);
      selectedSource = "optionIds";
    } else {
      selectionIssues.push(`unknown-selected-option-id(${id.slice(0, 20)})`);
    }
  };

  const addByText = (raw: string) => {
    if (!raw.trim()) return;
    const key = normalizeOptionIdentity(raw);
    const matches = options.filter((o) => normalizeOptionIdentity(o.text) === key);
    if (matches.length === 1) {
      if (!selectedOptionIds.includes(matches[0].id)) selectedOptionIds.push(matches[0].id);
      selectedSource = "text";
    } else if (matches.length > 1) {
      selectionIssues.push("ambiguous-selected-option-text");
    } else {
      selectionIssues.push("selected-option-text-not-found");
    }
  };

  if (params.selectedOptionIds && params.selectedOptionIds.length > 0) {
    params.selectedOptionIds.forEach(addById);
  } else if (params.selectedOptionId) {
    addById(params.selectedOptionId);
  } else if (params.selectedAnswers && params.selectedAnswers.length > 0) {
    params.selectedAnswers.forEach(addByText);
  } else if (params.selectedAnswer !== undefined && params.selectedAnswer.trim() !== "") {
    // Legacy clients serialise multi-picks with " ‖ ".
    params.selectedAnswer
      .split(/\s*‖\s*/)
      .filter((part) => part.trim().length > 0)
      .forEach(addByText);
  }

  const contextDate =
    record.exam?.heldOn != null
      ? record.exam.heldOn.toISOString().slice(0, 10)
      : record.year != null
        ? String(record.year)
        : record.exam?.year != null
          ? String(record.exam.year)
          : null;

  const ecosystem = record.subject?.ecosystem.code ?? null;
  const contentHash = sha256Hex([
    "mcq-snapshot-v1",
    String(record.id),
    questionText,
    record.questionType,
    record.topic,
    record.subtopic,
    record.subject?.nameEn ?? "",
    contextDate ?? "",
    ...options.map((o) => `${o.id}:${o.text}`),
  ]);

  return {
    questionId: record.id,
    questionVersion: `q1-${contentHash.slice(0, 24)}`,
    contentHash,
    questionText,
    options,
    answerFormat: toAnswerFormat(record.questionType),
    context: {
      ecosystem,
      examType: record.exam?.category?.nameEn ?? record.exam?.nameEn ?? null,
      subject: record.subject?.nameEn ?? record.subject?.nameBn ?? null,
      topic: record.topic || null,
      subtopic: record.subtopic || null,
      language: detectLanguage(questionText),
      jurisdiction: ecosystem ? "BD" : null,
      contextDate,
      contextYear: record.year ?? record.exam?.year ?? null,
    },
    attemptId: params.attemptId ?? null,
    selectedOptionIds,
    selectedSource,
    structuralIssues,
    selectionIssues,
    structurallyValid: structuralIssues.length === 0,
  };
}

/** Load only non-answer-revealing columns. */
export async function loadCanonicalSnapshot(
  questionId: number,
  params: {
    attemptId?: string;
    selectedOptionId?: string;
    selectedOptionIds?: string[];
    selectedAnswer?: string;
    selectedAnswers?: string[];
  } = {},
): Promise<CanonicalSnapshot | null> {
  const record = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      question: true,
      options: true,
      rawMath: true,
      questionType: true,
      topic: true,
      subtopic: true,
      year: true,
      subject: {
        select: {
          nameBn: true,
          nameEn: true,
          ecosystem: { select: { code: true } },
        },
      },
      exam: {
        select: {
          nameEn: true,
          year: true,
          heldOn: true,
          category: { select: { nameEn: true } },
        },
      },
      // Intentionally absent: correctAnswer, correctAnswers, explanation.
    },
  });
  if (!record) return null;
  return buildCanonicalSnapshot(record as VerificationRecord, params);
}

/**
 * Audit-stage-only read of the stored key. Never call this before the
 * independent finding exists, and never pass its result to the solver.
 */
export async function loadCanonicalAnswerKey(questionId: number): Promise<{
  keyTexts: string[];
  source: "correctAnswers" | "correctAnswer" | "none";
  questionType: AnswerFormat;
} | null> {
  const row = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      correctAnswer: true,
      correctAnswers: true,
      questionType: true,
    },
  });
  if (!row) return null;

  const many = Array.isArray(row.correctAnswers)
    ? row.correctAnswers.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const keyTexts = many.length > 0 ? many : row.correctAnswer ? [row.correctAnswer] : [];
  return {
    keyTexts,
    source: many.length > 0 ? "correctAnswers" : row.correctAnswer ? "correctAnswer" : "none",
    questionType: toAnswerFormat(row.questionType),
  };
}

/**
 * Validate that the client's displayed option list is a permutation of the
 * stored options. This allows session shuffling without letting a client
 * substitute option text. Returns display index → canonical option ID.
 */
export function verifyDisplayOptions(
  snapshot: CanonicalSnapshot,
  displayOptions: readonly string[] | undefined,
): string[] {
  const canonical = snapshot.options.map((o) => normalizeOptionIdentity(o.text));
  if (!displayOptions) return snapshot.options.map((o) => o.id);

  if (displayOptions.length !== canonical.length) {
    throw new ValidationError(
      `Option set mismatch: expected ${canonical.length} options, received ${displayOptions.length}.`,
    );
  }

  const pool = snapshot.options.map((option) => ({
    id: option.id,
    identity: normalizeOptionIdentity(option.text),
  }));
  const used = new Set<number>();
  const mapping: string[] = [];
  for (const displayText of displayOptions) {
    const identity = normalizeOptionIdentity(displayText);
    const index = pool.findIndex((entry, i) => !used.has(i) && entry.identity === identity);
    if (index === -1) {
      throw new ValidationError(
        "Option set mismatch: the displayed options are not a permutation of the stored question.",
      );
    }
    used.add(index);
    mapping.push(pool[index].id);
  }
  return mapping;
}

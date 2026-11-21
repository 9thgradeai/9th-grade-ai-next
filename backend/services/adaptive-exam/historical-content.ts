// backend/services/adaptive-exam/historical-content.ts
// Pure parsing/normalisation helpers for the Phase 05 historical corpus.
//
// This module never marks an answer verified, never assigns a difficulty band
// and never invents a subject, year, set, source or explanation. It preserves
// source claims as claims and uses explicit sentinels for missing values.

import type {
  AnswerVerificationStatus,
  HistoricalQuestionRecord,
  ImportIssue,
  IsoTimestamp,
  LanguageCode,
  OptionKey,
  QuestionOptions,
} from "./contracts";
import { hashSnapshot } from "./hash";
import {
  normaliseSectionLabel,
  type HistoricalSourceDescriptor,
  type HistoricalSubjectMapping,
} from "./historical-sources";

export type ParsedHistoricalRecord = Readonly<{
  record: HistoricalQuestionRecord;
  /** Hash of normalised question text: the only available duplicate fingerprint. */
  fingerprint: string;
  /** Stored in HistoricalQuestion.contentHash (see 05-HISTORICAL-INGESTION.md). */
  contentHash: string;
}>;

export type ParseOutcome = Readonly<{
  records: ParsedHistoricalRecord[];
  issues: ImportIssue[];
}>;

const BENGALI_SCRIPT = /[\u0980-\u09FF]/u;
const BENGALI_DIGITS: Readonly<Record<string, string>> = Object.freeze({
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
});
const OPTION_LETTERS: readonly OptionKey[] = ["A", "B", "C", "D"];
const BENGALI_OPTION_KEYS: Readonly<Record<string, OptionKey>> = Object.freeze({
  "ক": "A", "খ": "B", "গ": "C", "ঘ": "D",
});
const DISPUTE_MARKERS: readonly string[] = Object.freeze([
  "note mismatch",
  "marked as",
  "key অনুযায়ী",
  "key অনুযায়ী",
  "সঠিক উত্তর নেই",
  "(note",
]);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/gu, (digit) => BENGALI_DIGITS[digit] ?? digit);
}

function detectLanguage(text: string): LanguageCode {
  return BENGALI_SCRIPT.test(text) ? "bn" : "en";
}

/** NFC + line-ending + whitespace normalisation. Original text is never mutated. */
export function normaliseHistoricalText(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collapseInline(value: string): string {
  return normaliseHistoricalText(value)
    .replace(/\s*\n\s*/g, " ")
    .replace(/^\s*\|\s*/, "")
    .replace(/\s*\|\s*$/, "");
}

function optionKeyFromToken(token: string): OptionKey | null {
  const upper = token.toUpperCase();
  if ((OPTION_LETTERS as readonly string[]).includes(upper)) return upper as OptionKey;
  return BENGALI_OPTION_KEYS[token] ?? null;
}

function makeIssue(
  ref: string,
  stage: ImportIssue["stage"],
  reason: string,
  severity: ImportIssue["severity"] = "warning",
): ImportIssue {
  return {
    recordRef: ref,
    stage,
    reason,
    severity,
    preservedRef: ref,
  };
}

function buildRecord(input: {
  source: HistoricalSourceDescriptor;
  ref: string;
  index: number;
  subject?: HistoricalSubjectMapping;
  questionText: string;
  options: QuestionOptions;
  claimedAnswer?: OptionKey;
  explanation?: string;
  verification: AnswerVerificationStatus;
  originalSourceText: string;
  now: IsoTimestamp;
}): ParsedHistoricalRecord {
  const subject = input.subject ?? input.source.defaultSubject;
  const questionText = collapseInline(input.questionText);
  const options: QuestionOptions = {
    A: collapseInline(input.options.A),
    B: collapseInline(input.options.B),
    C: collapseInline(input.options.C),
    D: collapseInline(input.options.D),
  };
  const language = detectLanguage(`${questionText} ${options.A} ${options.B} ${options.C} ${options.D}`);
  const normalizedText = normaliseHistoricalText(questionText);
  const fingerprint = hashSnapshot({ normalizedText, language });

  const record: HistoricalQuestionRecord = {
    id: `${input.source.id}:${input.index}`,
    family: input.source.family,
    organization: input.source.organization,
    recruitmentPost: input.source.recruitmentPost,
    examinationName: input.source.examinationName,
    ...(input.source.examYear === undefined ? {} : { examYear: input.source.examYear }),
    stage: input.source.stage,
    ...(input.source.paperSet ? { paperSet: input.source.paperSet } : {}),
    subjectId: subject.subjectId,
    subjectName: subject.subjectName,
    topicPath: subject.topicPath,
    originalLanguage: language,
    questionText,
    options,
    ...(input.claimedAnswer ? { claimedAnswer: input.claimedAnswer } : {}),
    verification: input.verification,
    ...(input.explanation
      ? { explanation: collapseInline(input.explanation), explanationOrigin: "historical" as const }
      : { explanationOrigin: "none" as const }),
    provenance: {
      sourceType: "PYQ",
      sourceFile: input.source.filePath,
      reference: input.ref,
    },
    classification: { status: "unclassified" },
    originalSourceText: input.originalSourceText,
    normalizedText,
    // Source claims are never PYQ-eligible. Only an independent verification
    // pass, outside this parser, may change this flag.
    eligibleForPyq: false,
    createdAt: input.now,
    updatedAt: input.now,
  };

  return { record, fingerprint, contentHash: fingerprint };
}

// ─────────────────────────────────────────────────────────────
// BCS Uttoron JSON
// ─────────────────────────────────────────────────────────────

function parseUttoronExamMeta(raw: unknown): Map<string, { date?: string; setCode?: string }> {
  const result = new Map<string, { date?: string; setCode?: string }>();
  if (!Array.isArray(raw)) return result;
  for (const item of raw) {
    const exam = asRecord(item);
    const slug = nonEmptyString(exam?.slug);
    if (!slug) continue;
    result.set(slug, {
      ...(nonEmptyString(exam?.date) ? { date: nonEmptyString(exam?.date) ?? undefined } : {}),
      ...(nonEmptyString(exam?.set_code) ? { setCode: nonEmptyString(exam?.set_code) ?? undefined } : {}),
    });
  }
  return result;
}

export function parseUttoronSource(
  text: string,
  source: HistoricalSourceDescriptor,
  now: IsoTimestamp,
): ParseOutcome {
  const issues: ImportIssue[] = [];
  const parsed: ParsedHistoricalRecord[] = [];
  let root: LooseRecord | null = null;
  try {
    root = asRecord(JSON.parse(text));
  } catch {
    return {
      records: [],
      issues: [makeIssue(source.id, "PARSING", "Source is not valid JSON.", "error")],
    };
  }
  if (!root || !Array.isArray(root.questions)) {
    return {
      records: [],
      issues: [makeIssue(source.id, "PARSING", "Source has no questions array.", "error")],
    };
  }

  // Metadata totals are claims; the imported totals always come from the array.
  const exams = parseUttoronExamMeta(root.exams);

  root.questions.forEach((item, index) => {
    const raw = asRecord(item);
    const number = nonEmptyString(raw?.question_number) ?? String(index + 1);
    const ref = `${source.id}#${number}`;
    if (!raw) {
      issues.push(makeIssue(ref, "PARSING", "Question row is not an object.", "error"));
      return;
    }

    const questionText = nonEmptyString(raw.question);
    const rawOptions: QuestionOptions = {
      A: nonEmptyString(raw.option_a) ?? "",
      B: nonEmptyString(raw.option_b) ?? "",
      C: nonEmptyString(raw.option_c) ?? "",
      D: nonEmptyString(raw.option_d) ?? "",
    };
    if (!questionText || OPTION_LETTERS.some((key) => rawOptions[key].length === 0)) {
      issues.push(makeIssue(ref, "PARSING", "Question text or one of options A–D is missing.", "error"));
      return;
    }

    const claimed = nonEmptyString(raw.correct_answer)?.toUpperCase();
    const claimedAnswer = claimed && (OPTION_LETTERS as readonly string[]).includes(claimed)
      ? (claimed as OptionKey)
      : undefined;
    const verification: AnswerVerificationStatus = claimedAnswer ? "SOURCE_CLAIMED" : "UNVERIFIED";
    if (!claimedAnswer) {
      issues.push(makeIssue(ref, "ANSWER_EXTRACTION", "Source does not supply a claimed answer."));
    }

    const slug = nonEmptyString(raw.exam_slug);
    const exam = slug ? exams.get(slug) : undefined;
    const subjectKey = nonEmptyString(raw.subject_id) ?? nonEmptyString(raw.subject_en) ?? "";
    const subject = source.subjectMap?.[subjectKey];
    const explanation = nonEmptyString(raw.solve_note) ?? undefined;

    const record = buildRecord({
      source,
      ref,
      index,
      subject,
      questionText,
      options: rawOptions,
      ...(claimedAnswer ? { claimedAnswer } : {}),
      ...(explanation ? { explanation } : {}),
      verification,
      originalSourceText: JSON.stringify(raw),
      now,
    });
    // Rebuild provenance with exam-derived source claims.
    const withExam: ParsedHistoricalRecord = {
      ...record,
      record: {
        ...record.record,
        ...(exam?.date ? { examDate: exam.date, examYear: Number.parseInt(exam.date.slice(0, 4), 10) } : {}),
        ...(exam?.setCode ? { paperSet: exam.setCode } : {}),
        provenance: {
          ...record.record.provenance,
          ...(slug ? { reference: `${ref}:${slug}` } : {}),
        },
      },
    };
    parsed.push(withExam);
  });

  return { records: parsed, issues };
}

// ─────────────────────────────────────────────────────────────
// Bangladesh Bank Senior Officer (General) text files
// ─────────────────────────────────────────────────────────────

type BankBlock = Readonly<{
  number: string;
  section?: HistoricalSubjectMapping;
  lines: string[];
}>;

const BANK_QUESTION_START = /^\s*((?:\d+|[০-৯]+))[.)]\s*(.*)$/u;
const BANK_ANSWER_MARKER = /(?:Ans\.|উত্তর:|Answer:)\s*\(?([a-dA-Dকখগঘ])(?=[.)]|\s|$)/iu;
const BANK_EXPLANATION_MARKER = /(?:ব্যাখ্যা:|Explanation:)/iu;
const BANK_OPTION_MARKER = /(?:^|[\s|])\(?([a-dA-Dকখগঘ])[.)]\s*/giu;

function sectionMapping(label: string, source: HistoricalSourceDescriptor): HistoricalSubjectMapping | undefined {
  const normalised = normaliseSectionLabel(label.replace(/^■+\s*/, "").replace(/\s+Section$/iu, ""));
  const key = normalised.startsWith("section ") ? normalised.slice(8) : normalised;
  return source.subjectMap?.[key];
}

function splitBankBlocks(text: string, source: HistoricalSourceDescriptor): BankBlock[] {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: BankBlock[] = [];
  let currentSection: HistoricalSubjectMapping | undefined;
  let current: { number: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (line.trim().startsWith("■")) {
      const mapped = sectionMapping(line, source);
      if (mapped) currentSection = mapped;
      continue;
    }
    const match = line.match(BANK_QUESTION_START);
    if (match) {
      if (current) blocks.push({ ...current, section: currentSection });
      current = { number: toLatinDigits(match[1]), lines: [line] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) blocks.push({ ...current, section: currentSection });
  return blocks;
}

function extractOptions(segment: string): {
  options: QuestionOptions;
  stem: string;
} | null {
  const markers: Array<{ key: OptionKey; index: number; end: number }> = [];
  for (const match of segment.matchAll(BANK_OPTION_MARKER)) {
    const key = optionKeyFromToken(match[1]);
    const index = match.index;
    if (!key) continue;
    if (markers.some((existing) => existing.key === key)) continue;
    markers.push({ key, index, end: index + match[0].length });
  }
  if (markers.length !== 4) return null;

  markers.sort((a, b) => a.index - b.index);
  const options: Partial<Record<OptionKey, string>> = {};
  for (let i = 0; i < markers.length; i += 1) {
    const marker = markers[i];
    const end = i + 1 < markers.length ? markers[i + 1].index : segment.length;
    options[marker.key] = collapseInline(segment.slice(marker.end, end));
  }
  if (OPTION_LETTERS.some((key) => !options[key])) return null;

  return {
    stem: collapseInline(segment.slice(0, markers[0].index)),
    options: options as QuestionOptions,
  };
}

function hasDisputeMarker(text: string): boolean {
  const lower = normaliseSectionLabel(text);
  return DISPUTE_MARKERS.some((marker) => lower.includes(normaliseSectionLabel(marker)));
}

export function parseBankSoGeneralSource(
  text: string,
  source: HistoricalSourceDescriptor,
  now: IsoTimestamp,
): ParseOutcome {
  const issues: ImportIssue[] = [];
  const parsed: ParsedHistoricalRecord[] = [];

  for (const [index, block] of splitBankBlocks(text, source).entries()) {
    const ref = `${source.id}#${block.number}`;
    const originalSourceText = block.lines.join("\n").trim();
    const withoutNumber = originalSourceText.replace(/^\s*(?:\d+|[০-৯]+)[.)]\s*/u, "");
    const answerMatch = BANK_ANSWER_MARKER.exec(withoutNumber);
    const explanationMatch = BANK_EXPLANATION_MARKER.exec(withoutNumber);
    const answerIndex = answerMatch?.index ?? withoutNumber.length;
    const segment = withoutNumber.slice(0, answerIndex);
    const extracted = extractOptions(segment);
    if (!extracted || !extracted.stem) {
      issues.push(makeIssue(ref, "PARSING", "Could not extract a stem and four options from the source block.", "error"));
      continue;
    }

    const claimedAnswer = answerMatch ? optionKeyFromToken(answerMatch[1]) ?? undefined : undefined;
    const disputed = hasDisputeMarker(withoutNumber.slice(answerIndex));
    const verification: AnswerVerificationStatus = disputed
      ? "DISPUTED"
      : claimedAnswer
        ? "SOURCE_CLAIMED"
        : "UNVERIFIED";

    if (disputed) {
      issues.push(makeIssue(ref, "VERIFICATION", "Source answer carries an explicit caveat; treated as disputed."));
    } else if (!claimedAnswer) {
      issues.push(makeIssue(ref, "ANSWER_EXTRACTION", "Source does not supply a claimed answer."));
    }

    const explanation = explanationMatch
      ? withoutNumber.slice(explanationMatch.index + explanationMatch[0].length).trim()
      : undefined;

    parsed.push(
      buildRecord({
        source,
        ref,
        index,
        subject: block.section,
        questionText: extracted.stem,
        options: extracted.options,
        ...(claimedAnswer ? { claimedAnswer } : {}),
        ...(explanation ? { explanation } : {}),
        verification,
        originalSourceText,
        now,
      }),
    );
  }

  return { records: parsed, issues };
}

// ─────────────────────────────────────────────────────────────
// Shared pipeline helpers
// ─────────────────────────────────────────────────────────────

export function parseHistoricalSource(
  text: string,
  source: HistoricalSourceDescriptor,
  now: IsoTimestamp,
): ParseOutcome {
  switch (source.format) {
    case "BCS_UTTORON_JSON":
      return parseUttoronSource(text, source, now);
    case "BANK_SO_GENERAL_TXT":
      return parseBankSoGeneralSource(text, source, now);
    default:
      return {
        records: [],
        issues: [makeIssue(source.id, "PARSING", "Unsupported historical source format.", "error")],
      };
  }
}

/**
 * Flags repeated normalised questions without deleting them. Selection code
 * excludes duplicate groups; preserving every row keeps the source auditable.
 */
export function dedupeParsedRecords(
  records: readonly ParsedHistoricalRecord[],
): { records: ParsedHistoricalRecord[]; duplicateCount: number } {
  const groupByFingerprint = new Map<string, string>();
  let duplicateCount = 0;
  const result = records.map((item) => {
    const existing = groupByFingerprint.get(item.fingerprint);
    const duplicateGroupId = existing ?? `dup:${item.fingerprint}`;
    if (!existing) groupByFingerprint.set(item.fingerprint, duplicateGroupId);
    else duplicateCount += 1;
    return {
      ...item,
      record: { ...item.record, duplicateGroupId },
    };
  });
  return { records: result, duplicateCount };
}

// backend/services/adaptive-exam/live-question-binding.ts
// Pure mapping helpers for the read-only bridge from the live Question bank.
// Nothing here writes to the live bank or asserts verification.

import "server-only";

import type { ExamFamily, ExamProfile, LanguageCode, OptionKey, QuestionOptions } from "./contracts";
import { hashSnapshot } from "./hash";

export type LiveQuestionRow = {
  id: number;
  ecosystemCode: string;
  subjectNameBn: string;
  subjectNameEn: string;
  path: string;
  topic: string;
  subtopic: string;
  question: string;
  options: unknown;
  correctAnswer: string;
  explanation: string;
  questionType: string;
  year: number | null;
  sourceExam: string;
  sourceKey: string;
  difficulty: string;
  rawMath: boolean;
};

export function familyForEcosystem(code: string): ExamFamily | null {
  if (code === "BCS") return "BCS";
  if (code === "BANGLADESH_BANK" || code === "BANK") return "BANK";
  return null;
}

/** Match a live Subject row to a config subject by exact/alias name. */
export function bindSubject(row: LiveQuestionRow, profile: ExamProfile): string | null {
  const names = [row.subjectNameBn, row.subjectNameEn]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const subject of profile.subjects) {
    const candidates = [subject.nameBn, subject.nameEn, ...subject.aliases]
      .map((value) => value.trim().toLowerCase());
    if (candidates.some((candidate) => names.includes(candidate))) return subject.subjectId;
  }
  return null;
}

export function optionsFromJson(value: unknown): { options: QuestionOptions | null; count: number } {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { options?: unknown }).options)
      ? (value as { options: unknown[] }).options
      : [];
  if (list.length !== 4) return { options: null, count: list.length };
  const keys: OptionKey[] = ["A", "B", "C", "D"];
  const options = {} as Record<OptionKey, string>;
  list.forEach((item, index) => {
    options[keys[index]] = typeof item === "string" ? item : String((item as { text?: unknown })?.text ?? "");
  });
  return { options, count: list.length };
}

/** Resolve the source's answer claim by text, never by position assumption. */
export function claimedAnswerFromText(
  answerText: string,
  options: QuestionOptions,
): OptionKey | undefined {
  const normalized = answerText.trim().toLowerCase();
  if (!normalized) return undefined;
  const exact = (Object.keys(options) as OptionKey[]).find(
    (key) => options[key].trim().toLowerCase() === normalized,
  );
  if (exact) return exact;
  if (/^[A-Da-d]$/.test(normalized)) return normalized.toUpperCase() as OptionKey;
  return undefined;
}

export function normalizeQuestionText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

export function languageForSubject(subjectId: string, row: LiveQuestionRow): LanguageCode {
  if (subjectId.includes("english") || /english/i.test(row.subjectNameEn)) return "en";
  if (/[\u0980-\u09FF]/.test(row.question)) return "bn";
  return "en";
}

export function liveFingerprint(question: string, options: QuestionOptions): string {
  return hashSnapshot({
    text: normalizeQuestionText(question),
    options: Object.values(options).map(normalizeQuestionText),
  });
}

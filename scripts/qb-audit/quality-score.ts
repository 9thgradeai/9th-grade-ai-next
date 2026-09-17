/**
 * scripts/qb-audit/quality-score.ts
 * ----------------------------------------------------------------------------
 * Phase 18: Quality scoring system for every question.
 *
 * Scoring dimensions (0-100 total):
 *   Unicode Integrity       0–20
 *   Structure Integrity     0–20
 *   Formatting Quality      0–15
 *   Option Integrity        0–15
 *   Explanation Integrity   0–10
 *   Metadata Integrity      0–10
 *   Duplicate Risk          0–5
 *   Content Integrity       0–5
 * ----------------------------------------------------------------------------
 */

import type { QuestionRecord, UnicodeIssue, StructureIssue, DuplicateGroup, QualityScore } from "./types";

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hasBangla(s: string): boolean {
  return /[\u0980-\u09FF]/.test(s);
}

function hasEnglish(s: string): boolean {
  return /[a-zA-Z]/.test(s);
}

function hasMath(s: string): boolean {
  return /[²³√∑∞≤≥≠±×÷π%0-9]+\s*[=+\-*/^]/.test(s) ||
    /\\frac|\\sqrt|\\sum|\^\\?\\{?\d/.test(s);
}

export function scoreUnicodeIntegrity(
  r: QuestionRecord,
  unicodeIssues: UnicodeIssue[]
): number {
  let score = 20;
  const fieldIssues = unicodeIssues.filter((i) => i.recordId === r.id);

  for (const issue of fieldIssues) {
    switch (issue.type) {
      case "REPLACEMENT_CHAR":
      case "MOJIBAKE":
      case "DOUBLE_ENCODING":
        score -= 8;
        break;
      case "BROKEN_BANGLA":
        score -= 5;
        break;
      case "CONTROL_CHAR":
      case "INVALID_SEQUENCE":
        score -= 3;
        break;
      case "NON_STANDARD_SPACE":
        score -= 1;
        break;
      case "NON_NFC":
        score -= 1;
        break;
    }
  }

  return clamp(score, 0, 20);
}

export function scoreStructureIntegrity(
  r: QuestionRecord,
  structureIssues: StructureIssue[]
): number {
  let score = 20;
  const fieldIssues = structureIssues.filter((i) => i.recordId === r.id);

  for (const issue of fieldIssues) {
    switch (issue.type) {
      case "EMPTY_QUESTION":
      case "MISSING_QUESTION":
        score -= 10;
        break;
      case "MISSING_OPTIONS":
        score -= 8;
        break;
      case "WRONG_OPTION_COUNT":
        score -= 4;
        break;
      case "EMPTY_OPTION":
        score -= 4;
        break;
      case "DUPLICATE_OPTIONS":
        score -= 4;
        break;
      case "MISSING_ANSWER":
      case "EMPTY_ANSWER":
        score -= 6;
        break;
      case "ANSWER_MISMATCH":
        score -= 4;
        break;
      case "MISSING_EXPLANATION":
      case "EMPTY_EXPLANATION":
        score -= 2;
        break;
    }
  }

  return clamp(score, 0, 20);
}

export function scoreFormattingQuality(r: QuestionRecord): number {
  let score = 15;

  // Leading/trailing whitespace
  if (r.question !== r.question.trim()) score -= 1;
  if (r.correctAnswer !== r.correctAnswer.trim()) score -= 1;

  // Excessive spaces
  if (/\s{3,}/.test(r.question)) score -= 2;
  if (r.options.some((o) => /\s{3,}/.test(o))) score -= 1;

  // Repeated punctuation
  if (/[।.!?]{3,}/.test(r.question)) score -= 2;
  if (/[।.!?]{3,}/.test(r.explanation)) score -= 1;

  // Very long fields (possible extraction error)
  if (r.question.length > 500) score -= 2;
  if (r.explanation.length > 1000) score -= 1;

  // Random indentation
  if (/^\s{2,}/.test(r.question)) score -= 1;

  return clamp(score, 0, 15);
}

export function scoreOptionIntegrity(r: QuestionRecord): number {
  let score = 15;

  if (r.options.length !== 4) {
    score -= 8;
  }

  const nonEmpty = r.options.filter(Boolean);
  if (nonEmpty.length < r.options.length) {
    score -= 3 * (r.options.length - nonEmpty.length);
  }

  const unique = new Set(nonEmpty);
  if (unique.size < nonEmpty.length) {
    score -= 3;
  }

  // Options that are too short or too long
  for (const o of nonEmpty) {
    if (o.length < 1) score -= 1;
    if (o.length > 300) score -= 1;
  }

  return clamp(score, 0, 15);
}

export function scoreExplanationIntegrity(r: QuestionRecord): number {
  let score = 10;

  if (!r.explanation) {
    score -= 5;
  } else {
    if (r.explanation.length < 5) score -= 3;
    if (r.explanation.length > 1500) score -= 1;
    if (/\s{3,}/.test(r.explanation)) score -= 1;
  }

  return clamp(score, 0, 10);
}

export function scoreMetadataIntegrity(r: QuestionRecord): number {
  let score = 10;

  if (!r.topic && !r.path) score -= 2;
  if (!r.subjectName && !r.subjectId) score -= 2;
  if (!r.sourceKey) score -= 1;

  // BCS-specific metadata
  if (r.path?.includes("bcs") || r.bcsTerm) {
    if (!r.bcsTerm) score -= 1;
    if (!r.year) score -= 1;
  }

  return clamp(score, 0, 10);
}

export function scoreDuplicateRisk(r: QuestionRecord, duplicateGroups: DuplicateGroup[]): number {
  let score = 5;

  for (const group of duplicateGroups) {
    if (group.records.some((rec) => rec.id === r.id)) {
      if (group.type === "EXACT") score -= 5;
      else if (group.type === "NORMALIZED") score -= 4;
      else if (group.type === "NEAR") score -= 2;
      break;
    }
  }

  return clamp(score, 0, 5);
}

export function scoreContentIntegrity(r: QuestionRecord): number {
  let score = 5;

  // Sanity checks
  if (r.question && r.correctAnswer && r.question === r.correctAnswer) {
    score -= 3; // Question and answer are identical
  }

  if (r.options.includes(r.question)) {
    score -= 2; // Question text duplicated as an option
  }

  return clamp(score, 0, 5);
}

export function calculateQualityScore(
  r: QuestionRecord,
  unicodeIssues: UnicodeIssue[],
  structureIssues: StructureIssue[],
  duplicateGroups: DuplicateGroup[]
): QualityScore {
  const unicodeIntegrity = scoreUnicodeIntegrity(r, unicodeIssues);
  const structureIntegrity = scoreStructureIntegrity(r, structureIssues);
  const formattingQuality = scoreFormattingQuality(r);
  const optionIntegrity = scoreOptionIntegrity(r);
  const explanationIntegrity = scoreExplanationIntegrity(r);
  const metadataIntegrity = scoreMetadataIntegrity(r);
  const duplicateRisk = scoreDuplicateRisk(r, duplicateGroups);
  const contentIntegrity = scoreContentIntegrity(r);

  const total = unicodeIntegrity + structureIntegrity + formattingQuality +
    optionIntegrity + explanationIntegrity + metadataIntegrity +
    duplicateRisk + contentIntegrity;

  let grade: string;
  if (total >= 95) grade = "Excellent";
  else if (total >= 85) grade = "Good";
  else if (total >= 70) grade = "Needs minor cleanup";
  else if (total >= 50) grade = "Needs repair";
  else grade = "Critical / manual review";

  return {
    unicodeIntegrity,
    structureIntegrity,
    formattingQuality,
    optionIntegrity,
    explanationIntegrity,
    metadataIntegrity,
    duplicateRisk,
    contentIntegrity,
    total,
    grade,
  };
}

// backend/services/error-classifier.ts — deterministic, server-side error
// classification for WRONG answers (Phase 2).
//
// The classifier is PURE and STATELESS: it takes a single wrong attempt's
// observable evidence (question difficulty, time spent, and the user's
// PRIOR question-progress state) and returns one of the MistakeErrorType
// enums. It NEVER invents signals the submission flow did not provide.
//
// Correct answers always classify to `null` (an error type describes a
// mistake; scoring right is not a mistake).
//
// Rule order matters — the first matching rule wins (short-circuit):
//   1. Previously MASTERED question  → MEMORY_FAILURE (they knew it once)
//   2. durationSec <= 8              → GUESSING (too fast to read properly)
//   3. durationSec >= 90             → CONCEPTUAL_GAP (ground to a halt)
//   4. consecutiveIncorrect >= 2
//      OR total mistakeCount >= 3    → CONCEPTUAL_GAP (repeat offender)
//   5. EASY                          → CARELESS_MISTAKE (easy, still wrong)
//   6. MEDIUM                        → CONFUSION
//   7. HARD                          → CONCEPTUAL_GAP
//   8. no evidence at all            → UNKNOWN
//
// `durationSec = 0` means the client did not report time (practice/daily
// quizzes do today) — treated as "not provided", so rules 2–3 are skipped.

import "server-only";

import type { Difficulty, MistakeErrorType, MasteryStatus } from "@prisma/client";

export type ErrorClassificationInput = {
  /** The attempt being classified. Only correct === false is classified. */
  isCorrect: boolean;
  /** Question difficulty when the source record has one (daily quiz does not). */
  difficulty?: Difficulty | string | null;
  /** Seconds spent on the question. 0 / absent = not provided. */
  durationSec?: number | null;
  /** The user's progress on this question BEFORE this attempt. */
  previous?: {
    masteryStatus?: MasteryStatus | null;
    consecutiveIncorrect?: number;
    mistakeCount?: number;
    totalAttempts?: number;
  };
};

/** Bengali labels for the UI (mistake-notebook filter + rows). */
export const ERROR_TYPE_LABELS: Record<MistakeErrorType, string> = {
  UNKNOWN: "অনিশ্চিত",
  GUESSING: "অনুমান করা",
  CARELESS_MISTAKE: "অসাবধানতাজনিত ভুল",
  CONFUSION: "বিভ্রান্তি",
  CONCEPTUAL_GAP: "ধারণাগত দুর্বলতা",
  MEMORY_FAILURE: "ভুলে যাওয়া",
  MISREADING: "প্রশ্ন না-বোঝা",
  CALCULATION_ERROR: "হিসাবের ভুল",
  TIME_PRESSURE: "সময়ের চাপ",
};

// Upper bound (seconds) below which an answer is implausibly fast to have been
// read, and the lower bound above which the learner effectively stalled.
const FAST_ANSWER_BOUND_S = 8;
const SLOW_ANSWER_BOUND_S = 90;

/** Pure classifier — see module doc for the exact rule table. */
export function classifyErrorType(input: ErrorClassificationInput): MistakeErrorType | null {
  if (input.isCorrect) return null;

  const prev = input.previous;
  const duration = input.durationSec && input.durationSec > 0 ? Math.floor(input.durationSec) : 0;

  if (prev?.masteryStatus === "MASTERED") return "MEMORY_FAILURE";

  if (duration > 0 && duration <= FAST_ANSWER_BOUND_S) return "GUESSING";
  if (duration >= SLOW_ANSWER_BOUND_S) return "CONCEPTUAL_GAP";

  const repeated =
    (prev?.consecutiveIncorrect ?? 0) >= 2 || (prev?.mistakeCount ?? 0) >= 3;
  if (repeated) return "CONCEPTUAL_GAP";

  switch (input.difficulty) {
    case "EASY":
      return "CARELESS_MISTAKE";
    case "MEDIUM":
      return "CONFUSION";
    case "HARD":
      return "CONCEPTUAL_GAP";
    default:
      return "UNKNOWN";
  }
}

/** Narrow a raw string to a valid MistakeErrorType (used for API filter parsing). */
export function parseErrorType(value: string | null | undefined): MistakeErrorType | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  const valid: MistakeErrorType[] = [
    "CONCEPTUAL_GAP",
    "CARELESS_MISTAKE",
    "MEMORY_FAILURE",
    "MISREADING",
    "CALCULATION_ERROR",
    "CONFUSION",
    "GUESSING",
    "TIME_PRESSURE",
    "UNKNOWN",
  ];
  return valid.includes(upper as MistakeErrorType) ? (upper as MistakeErrorType) : undefined;
}
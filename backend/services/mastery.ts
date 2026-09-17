// backend/services/mastery.ts — configurable mastery thresholds and scoring.
// Pure functions with no DB dependency; testable in isolation.
// Server-only (imported by services that are server-only).

import "server-only";

// ── Configurable thresholds ────────────────────────────────
// These control when a question transitions between mastery states.
// Exported for testability; NOT mutated at runtime.

/** Consecutive correct answers needed to reach each status. */
export const MASTERY_THRESHOLDS = {
  /** 1 correct after a mistake → REVIEWING */
  reviewAfterCorrect: 1,
  /** 2 consecutive correct → IMPROVING */
  improvingAfterCorrect: 2,
  /** 3 consecutive correct → MASTERED */
  masteredAfterCorrect: 3,
} as const;

/** Mastery score deltas per attempt outcome. */
export const MASTERY_SCORE_DELTAS = {
  correct: 15,
  incorrect: -25,
} as const;

/** Bounds for the mastery score (0–100). */
export const MASTERY_SCORE_MIN = 0;
export const MASTERY_SCORE_MAX = 100;

/** Spaced-repetition review intervals (in hours) based on mistake count. */
export const REVIEW_INTERVALS = {
  /** First review: 4 hours */
  first: 4,
  /** Second review: 12 hours */
  second: 12,
  /** Third review: 24 hours */
  third: 24,
  /** Subsequent reviews: 48 hours */
  subsequent: 48,
} as const;

export type MasteryStatus = "NEW" | "STRUGGLING" | "REVIEWING" | "IMPROVING" | "MASTERED";

/**
 * Compute the next mastery status given the current state and whether the
 * latest attempt was correct.
 *
 * Semantics:
 *  - NEW: never attempted. First correct keeps NEW (no mistake to recover from).
 *  - STRUGGLING: recently answered incorrectly. First correct after a mistake
 *    → REVIEWING.
 *  - REVIEWING: 2 consecutive correct → IMPROVING.
 *  - IMPROVING: 3 consecutive correct → MASTERED.
 *  - Any incorrect → STRUGGLING (mastery regresses).
 */
export function computeMasteryStatus(
  currentStatus: MasteryStatus,
  isCorrect: boolean,
  consecutiveCorrect: number,
): MasteryStatus {
  if (!isCorrect) {
    // Incorrect: regress to STRUGGLING regardless of current status.
    return "STRUGGLING";
  }

  if (currentStatus === "NEW") {
    // First-ever attempt correct — stay NEW (not a mistake recovery).
    return "NEW";
  }

  if (consecutiveCorrect >= MASTERY_THRESHOLDS.masteredAfterCorrect) {
    return "MASTERED";
  }
  if (consecutiveCorrect >= MASTERY_THRESHOLDS.improvingAfterCorrect) {
    return "IMPROVING";
  }
  if (consecutiveCorrect >= MASTERY_THRESHOLDS.reviewAfterCorrect) {
    return "REVIEWING";
  }

  return currentStatus;
}

/**
 * Compute the next mastery score (clamped to 0–100).
 */
export function computeMasteryScore(
  currentScore: number,
  isCorrect: boolean,
): number {
  const delta = isCorrect ? MASTERY_SCORE_DELTAS.correct : MASTERY_SCORE_DELTAS.incorrect;
  return Math.max(MASTERY_SCORE_MIN, Math.min(MASTERY_SCORE_MAX, currentScore + delta));
}

/**
 * Determine whether a question is still a "mistake" that needs practice.
 * A question is a mistake if the user has gotten it wrong at least once AND
 * hasn't demonstrated consistent mastery.
 */
export function isStillAMistake(
  status: MasteryStatus,
  incorrectAttempts: number,
): boolean {
  if (incorrectAttempts === 0) return false;
  // MASTERED questions are no longer mistakes (unless they regress later).
  return status !== "MASTERED";
}

/**
 * Compute the next review interval in hours based on mistake count and
 * current mastery status.
 */
export function computeReviewInterval(
  mistakeCount: number,
  status: MasteryStatus,
): number {
  if (status === "MASTERED") return 72; // 3 days for mastered
  if (mistakeCount <= 1) return REVIEW_INTERVALS.first;
  if (mistakeCount === 2) return REVIEW_INTERVALS.second;
  if (mistakeCount === 3) return REVIEW_INTERVALS.third;
  return REVIEW_INTERVALS.subsequent;
}

/**
 * Compute a priority score for mistake exam selection.
 * Higher score = should appear earlier in the exam.
 */
export function computeMistakePriorityScore(opts: {
  mistakeCount: number;
  lastIncorrectAt: Date | null;
  masteryScore: number;
  nextReviewAt: Date | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  totalAttempts: number;
  now?: Date;
}): number {
  const now = opts.now ?? new Date();
  let score = 0;

  // Frequency: more mistakes = higher priority (max ~40 points)
  score += Math.min(40, opts.mistakeCount * 8);

  // Recency: more recent = higher priority (max ~25 points)
  if (opts.lastIncorrectAt) {
    const hoursSince = (now.getTime() - opts.lastIncorrectAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) score += 25;
    else if (hoursSince < 24) score += 20;
    else if (hoursSince < 72) score += 15;
    else if (hoursSince < 168) score += 10;
    else score += 5;
  }

  // Low mastery = higher priority (max ~20 points)
  score += Math.round(((100 - opts.masteryScore) / 100) * 20);

  // Due for review = bonus (max ~10 points)
  if (opts.nextReviewAt && opts.nextReviewAt <= now) {
    score += 10;
  }

  // Difficulty bonus (max ~5 points)
  if (opts.difficulty === "HARD") score += 5;
  else if (opts.difficulty === "MEDIUM") score += 3;

  return score;
}

/**
 * Smart distribution for cross-subject mistake exams. Allocates questions
 * across subjects proportionally to their mistake counts, with a minimum of 1
 * per subject (when total allows).
 */
export function allocateMistakesAcrossSubjects(
  totalCount: number,
  subjectMistakeCounts: { subject: string; count: number }[],
): { subject: string; allocated: number }[] {
  if (subjectMistakeCounts.length === 0) return [];
  if (subjectMistakeCounts.length === 1) {
    return [{ subject: subjectMistakeCounts[0].subject, allocated: totalCount }];
  }

  const totalMistakes = subjectMistakeCounts.reduce((acc, s) => acc + s.count, 0);
  if (totalMistakes === 0) {
    // Equal distribution when no counts available.
    const perSubject = Math.floor(totalCount / subjectMistakeCounts.length);
    return subjectMistakeCounts.map((s) => ({
      subject: s.subject,
      allocated: Math.min(perSubject, s.count),
    }));
  }

  // Proportional allocation with largest-remainder method.
  const raw = subjectMistakeCounts.map((s) => ({
    subject: s.subject,
    exact: (s.count / totalMistakes) * totalCount,
    count: s.count,
  }));

  const base = raw.map((r) => Math.min(Math.floor(r.exact), r.count));
  let remainder = totalCount - base.reduce((acc, b) => acc + b, 0);

  const fractional = raw
    .map((r, i) => ({ i, f: r.exact - base[i] }))
    .sort((a, b) => b.f - a.f);

  for (const item of fractional) {
    if (remainder <= 0) break;
    const canAdd = raw[item.i].count - base[item.i];
    const toAdd = Math.min(remainder, Math.max(0, canAdd));
    base[item.i] += toAdd;
    remainder -= toAdd;
  }

  return raw.map((r, i) => ({
    subject: r.subject,
    allocated: base[i],
  }));
}

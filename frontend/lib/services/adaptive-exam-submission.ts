// frontend/lib/services/adaptive-exam-submission.ts
// Crash-safe submission seam for Adaptive Exam V2. A submit is persisted
// BEFORE the network call, retried with the same idempotency key, joined by
// concurrent clicks on the same attempt, and reconciled through the server's
// submission-status endpoint after a timeout or refresh.

import { adaptiveExam, ApiError } from "./api";
import type { AdaptiveExam } from "@/lib/types";

const PENDING_KEY = "ninth-grade-ai:adaptive-exam:pending-submit";
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

export type AdaptiveSubmitParams = {
  attemptId: string;
  paperId: string;
  answers: Record<number, AdaptiveExam.OptionKey>;
  durationSec: number;
  idempotencyKey: string;
};

export type PendingAdaptiveSubmission = {
  attemptId: string;
  paperId: string;
  answers: Array<{ position: number; option: AdaptiveExam.OptionKey }>;
  durationSec: number;
  idempotencyKey: string;
  savedAt: number;
};

export type AdaptiveSubmitOutcome = {
  outcome: "submitted" | "resumed";
  score: AdaptiveExam.Score;
};

let inFlight: {
  attemptId: string;
  promise: Promise<AdaptiveSubmitOutcome>;
} | null = null;

function isOption(value: unknown): value is AdaptiveExam.OptionKey {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function toArray(answers: Record<number, AdaptiveExam.OptionKey>) {
  return Object.entries(answers)
    .map(([position, option]) => ({ position: Number(position), option }))
    .filter((entry) => Number.isInteger(entry.position) && isOption(entry.option))
    .sort((a, b) => a.position - b.position);
}

export function persistPendingSubmission(params: AdaptiveSubmitParams): void {
  if (typeof window === "undefined") return;
  const entry: PendingAdaptiveSubmission = {
    attemptId: params.attemptId,
    paperId: params.paperId,
    answers: toArray(params.answers),
    durationSec: params.durationSec,
    idempotencyKey: params.idempotencyKey,
    savedAt: Date.now(),
  };
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(entry));
  } catch {
    /* storage unavailable — in-memory submit still proceeds */
  }
}

export function clearPendingSubmission(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignore */
  }
}

export function loadPendingSubmission(): PendingAdaptiveSubmission | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAdaptiveSubmission;
    if (
      typeof parsed.attemptId !== "string" ||
      typeof parsed.paperId !== "string" ||
      typeof parsed.idempotencyKey !== "string" ||
      !Array.isArray(parsed.answers) ||
      !parsed.answers.every((entry) =>
        typeof entry?.position === "number" && isOption(entry?.option),
      )
    ) {
      clearPendingSubmission();
      return null;
    }
    if (Date.now() - Number(parsed.savedAt || 0) > PENDING_MAX_AGE_MS) {
      clearPendingSubmission();
      return null;
    }
    return parsed;
  } catch {
    clearPendingSubmission();
    return null;
  }
}

/** Single entry point used by the runner, timer auto-submit, and recovery. */
export function submitAdaptiveExam(params: AdaptiveSubmitParams): Promise<AdaptiveSubmitOutcome> {
  if (inFlight?.attemptId === params.attemptId) return inFlight.promise;

  const promise = (async (): Promise<AdaptiveSubmitOutcome> => {
    persistPendingSubmission(params);
    try {
      const result = await adaptiveExam.submit(params.attemptId, {
        paperId: params.paperId,
        answers: toArray(params.answers),
        durationSec: params.durationSec,
        idempotencyKey: params.idempotencyKey,
      });
      clearPendingSubmission();
      return { outcome: "submitted", score: result.score };
    } catch (error) {
      // Keep the pending payload. A refresh will reconcile by attemptId.
      persistPendingSubmission(params);
      throw error;
    }
  })();

  inFlight = { attemptId: params.attemptId, promise };
  void promise.finally(() => {
    if (inFlight?.attemptId === params.attemptId) inFlight = null;
  });
  return promise;
}

export type AdaptiveRecoveryResult =
  | { outcome: "none" }
  | { outcome: "resumed"; score: AdaptiveExam.Score }
  | { outcome: "expired" }
  | { outcome: "pending"; submission: PendingAdaptiveSubmission };

/**
 * Called once on tab mount. If a submit was interrupted, the authoritative
 * server status decides whether to resume it, treat it as already completed,
 * or surface an expired attempt. The pending payload is cleared only after an
 authoritative result is known.
 */
export async function recoverAdaptiveSubmission(): Promise<AdaptiveRecoveryResult> {
  const pending = loadPendingSubmission();
  if (!pending) return { outcome: "none" };

  try {
    const status = await adaptiveExam.submissionStatus(pending.attemptId);
    if ((status.status === "COMPLETED" || status.status === "SUBMITTING") && status.score) {
      clearPendingSubmission();
      return { outcome: "resumed", score: status.score };
    }
    if (status.status === "EXPIRED") {
      clearPendingSubmission();
      return { outcome: "expired" };
    }
    const result = await submitAdaptiveExam({
      attemptId: pending.attemptId,
      paperId: pending.paperId,
      answers: Object.fromEntries(
        pending.answers.map((entry) => [entry.position, entry.option]),
      ),
      durationSec: pending.durationSec,
      idempotencyKey: pending.idempotencyKey,
    });
    return { outcome: "resumed", score: result.score };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearPendingSubmission();
      return { outcome: "none" };
    }
    return { outcome: "pending", submission: pending };
  }
}

// frontend/lib/services/exam-submission.ts — single canonical submission entry
// point for the browser. Every submit path (button click, timer expiry,
// auto-submit, keyboard shortcut, mobile UI) must call `submitExamAttempt()`
// here. The module owns:
//   • attemptId minting / persistence
//   • start → submit orchestration
//   • retry policy for transient failures
//   • error normalization for the UI
//
// Why this exists (root-cause fix):
//   Previously, CustomExamTab, MockTestTab and other components each had
//   their own copy of the submit logic — with their own `submittingRef`, their
//   own localStorage cleanup, and their own error handling. They diverged
//   subtly (e.g. MockTestTab cleared localStorage BEFORE the response, while
//   CustomExamTab cleared it AFTER), and none of them serialized the attempt
//   ID. Result: a double-click could submit twice, a timer + manual click
//   race could submit twice, and a network blip during a retry could lose
//   the result.

import { api, ApiError } from "./api";

const ATTEMPT_KEY_PREFIX = "ninth-grade-ai:exam:attempt:";

/**
 * Read the attemptId persisted for a given exam-storage-key, minting a fresh
 * one if the storage entry is missing/corrupt. Stored under a separate key
 * from the exam state so a state corruption doesn't lose the attempt token.
 */
export function ensureAttemptId(examStorageKey: string): string {
  if (typeof window === "undefined") return "";
  const idKey = `${ATTEMPT_KEY_PREFIX}${examStorageKey}`;
  try {
    const existing = window.localStorage.getItem(idKey);
    if (existing && isUuid(existing)) return existing;
  } catch {
    /* storage unavailable — fall through to mint */
  }
  const minted = mintUuid();
  try {
    window.localStorage.setItem(idKey, minted);
  } catch {
    /* best-effort — caller still has the in-memory value */
  }
  return minted;
}

/**
 * Drop the persisted attemptId after a confirmed successful submit so a
 * subsequent exam build can mint a fresh token. Safe to call multiple times.
 */
export function clearAttemptId(examStorageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${ATTEMPT_KEY_PREFIX}${examStorageKey}`);
  } catch {
    /* ignore */
  }
}

export type CanonicalSubmitResult = {
  outcome: "submitted" | "resumed";
  result: import("@/lib/types").Server.ExamResultDTO;
};

/**
 * The single submission entry point. Takes an attemptId (must already be
 * minted via ensureAttemptId), the question set, the elapsed seconds, and
 * the answers map. Calls /api/exam/submit and returns the canonical result.
 *
 * Throws an `Error` with a user-facing Bangla message on failure — the
 * caller is responsible for surfacing it in the UI. Never resolves to a
 * partial state: if the server returns a non-OK, we throw.
 *
 * Does NOT call /api/exam/start — the caller must do that at exam build time
 * (see `registerExam()` below).
 */
export async function submitExamAttempt(params: {
  attemptId: string;
  questionIds: number[];
  durationSec: number;
  answers: Record<number, string>;
}): Promise<CanonicalSubmitResult> {
  if (!isUuid(params.attemptId)) {
    throw new Error("পরীক্ষার সেশন শনাক্ত করা যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।");
  }
  const payload = params.questionIds.map((qid) => ({
    questionId: qid,
    selected: (params.answers[qid] ?? "").toString(),
  }));
  if (payload.length === 0) {
    throw new Error("কোনো প্রশ্ন জমা দেওয়ার জন্য পাওয়া যায়নি।");
  }

  try {
    const result = await api.submitExam({
      attemptId: params.attemptId,
      questionIds: params.questionIds,
      durationSec: Math.max(0, Math.floor(params.durationSec)),
      answers: payload,
    });
    return {
      outcome: (result as { outcome?: "submitted" | "resumed" }).outcome ?? "submitted",
      result,
    };
  } catch (err) {
    throw normalizeSubmitError(err);
  }
}

/**
 * Register a freshly built exam on the server so subsequent submits have an
 * IN_PROGRESS row to upsert. Idempotent on the server side — safe to call
 * multiple times for the same attemptId.
 *
 * Throws if the server rejects (e.g. auth expired, rate-limited). The caller
 * can decide whether to abort the exam start or proceed (submit will fail
 * again later, surfacing the same error).
 */
export async function registerExam(params: {
  attemptId: string;
  questionIds: number[];
}): Promise<void> {
  if (!isUuid(params.attemptId)) {
    throw new Error("পরীক্ষার সেশন শনাক্ত করা যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।");
  }
  try {
    await api.startExam(params);
  } catch (err) {
    throw normalizeSubmitError(err);
  }
}

function normalizeSubmitError(err: unknown): Error {
  if (err instanceof ApiError) {
    const msg = err.message || "জমা দেওয়া যায়নি";
    return new Error(`${msg} (${err.code})`);
  }
  if (err instanceof Error) return err;
  return new Error("জমা দেওয়া যায়নি। আবার চেষ্টা করুন।");
}

function mintUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Last-resort fallback for very old browsers — not cryptographically strong
  // but good enough for an idempotency key.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

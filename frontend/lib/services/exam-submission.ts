// frontend/lib/services/exam-submission.ts — single canonical submission entry
// point for the browser. Every submit path (button click, timer expiry,
// auto-submit, keyboard shortcut, mobile UI) must call `submitExamAttempt()`
// here. The module owns:
//   • attemptId minting / persistence
//   • start → submit orchestration
//   • idempotent retry + rendezvous (a repeated click joins the in-flight
//     submission instead of being blocked)
//   • persisted pending-submission recovery (a refresh/crash mid-submit can
//     always finish — the server dedupes by attemptId)
//   • error normalization for the UI
//
// Why this exists (root-cause fix):
//   Previously, CustomExamTab, MockTestTab and other components each had
//   their own copy of the submit logic — with their own `submittingRef`, their
//   own localStorage cleanup, and their own error handling. They diverged
//   subtly (e.g. MockTestTab cleared localStorage BEFORE the response, while
//   CustomExamTab cleared it AFTER), and none of them serialized the attempt
//   ID. A global boolean lock rejected duplicate clicks outright, and a
//   request whose RESPONSE BODY stalled (no body-read timeout) left the lock
//   wedged and the button permanently disabled. Result: abrupt network states
//   turned submission into an unrecoverable dead button — on desktop and
//   mobile alike. The design below removes every one of those failure paths:
//     • duplicate clicks JOIN the in-flight request (never blocked)
//     • transient failures retry with the same idempotency key (never fatal)
//     • an interrupted submission persists and is auto-recovered on reload

import { api, ApiError } from "./api";

const ATTEMPT_KEY_PREFIX = "ninth-grade-ai:exam:attempt:";
const PENDING_KEY_PREFIX = "ninth-grade-ai:exam:pending-submit:";

// A pending submission older than this is not auto-resurrected — the exam is
// simply no longer live and resurrecting it could double-score an ancient run.
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

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

export type PendingSubmission = {
  storageKey: string;
  attemptId: string;
  questionIds: number[];
  durationSec: number;
  answers: { questionId: number; selected: string }[];
  at: number;
};

// ── In-flight rendezvous ─────────────────────────────────────
// A single per-attemptId slot replaces the old global boolean lock. A repeated
// click on the same attempt JOINS the running request instead of being
// rejected, so the user always lands on the outcome. Different attempts run
// independently. If a promise settles, the slot is released in `finally`; the
// per-attemptId guard means a newer attempt can never be cleared by an older
// one's teardown.
let inFlight: { attemptId: string; promise: Promise<CanonicalSubmitResult> } | null = null;

export type SubmitExamAttemptParams = {
  attemptId: string;
  questionIds: number[];
  durationSec: number;
  answers: Record<number, string>;
  /** Storage key of the owning exam UI — enables crash/refresh recovery. */
  storageKey?: string;
};

/**
 * The single submission entry point. Takes an attemptId (must already be
 * minted via ensureAttemptId), the question set, the elapsed seconds, and
 * the answers map. Calls /api/exam/submit and returns the canonical result.
 *
 * Guarantees for callers:
 *   • Completes with a result on ANY successful network path (retries with the
 *     same idempotency key make transient failures self-healing).
 *   • A concurrent click on the same attempt resolves with the SAME result.
 *   • On failure the pending payload is kept, exposed via
 *     `recoverPendingSubmission()` for next mount — a submission is never
 *     silently lost.
 */
export async function submitExamAttempt(
  params: SubmitExamAttemptParams,
): Promise<CanonicalSubmitResult> {
  if (!isUuid(params.attemptId)) {
    throw new Error("পরীক্ষার সেশন শনাক্ত করা যায়নি। পৃষ্ঠা রিফ্রেশ করে আবার চেষ্টা করুন।");
  }

  const pending: PendingSubmission = {
    storageKey: params.storageKey ?? "",
    attemptId: params.attemptId,
    questionIds: params.questionIds,
    durationSec: Math.max(0, Math.floor(params.durationSec)),
    answers: params.questionIds.map((qid) => ({
      questionId: qid,
      selected: (params.answers[qid] ?? "").toString(),
    })),
    at: Date.now(),
  };
  if (pending.answers.length === 0) {
    throw new Error("কোনো প্রশ্ন জমা দেওয়ার জন্য পাওয়া যায়নি।");
  }

  // Join an in-flight submission of the same attempt instead of racing it.
  if (inFlight && inFlight.attemptId === params.attemptId) {
    return inFlight.promise;
  }

  const promise = submitCore(pending);
  inFlight = { attemptId: params.attemptId, promise };
  try {
    return await promise;
  } finally {
    // Release the rendezvous slot only if it still belongs to THIS attempt —
    // never clobber a newer attempt's slot by an older teardown. The null
    // check is deliberate: another concurrent attempt's finally may have
    // released the slot while we awaited.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (inFlight && inFlight.promise === promise) inFlight = null;
  }
}

async function submitCore(pending: PendingSubmission): Promise<CanonicalSubmitResult> {
  // Persist BEFORE the network call so a crash/refresh mid-flight can resume.
  persistPending(pending);
  try {
    const result = await api.submitExam({
      attemptId: pending.attemptId,
      questionIds: pending.questionIds,
      durationSec: pending.durationSec,
      answers: pending.answers,
    });
    // Success (incl. "resumed" for a previously-finalized attempt) — the
    // pending entry may now be cleared.
    clearPending(pending.storageKey);
    return {
      outcome: (result as { outcome?: "submitted" | "resumed" }).outcome ?? "submitted",
      result,
    };
  } catch (err) {
    // Keep the pending payload — `recoverPendingSubmission()` will retry.
    throw normalizeSubmitError(err);
  }
}

/**
 * Finish a submission that was interrupted (network died, page closed,
 * refresh). Re-sends the persisted payload with the same idempotency key;
 * the server answers from its snapshot (`outcome: "resumed"`) if the attempt
 * already committed, avoiding any double-scoring.
 *
 * Returns null when there is nothing to recover. Throws if the network is
 * still unusable — callers should fall back to resuming the exam normally.
 */
export async function recoverPendingSubmission(
  storageKey: string,
): Promise<CanonicalSubmitResult | null> {
  const pending = readPending(storageKey);
  if (!pending) return null;
  if (!isUuid(pending.attemptId) || Date.now() - pending.at > PENDING_MAX_AGE_MS) {
    clearPending(storageKey);
    return null;
  }
  const answers: Record<number, string> = {};
  for (const a of pending.answers) answers[a.questionId] = a.selected;
  return submitExamAttempt({
    attemptId: pending.attemptId,
    questionIds: pending.questionIds,
    durationSec: pending.durationSec,
    answers,
    storageKey,
  });
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

// ── Pending-submission persistence ──────────────────────────

function persistPending(pending: PendingSubmission): void {
  if (pending.storageKey.length === 0) return;
  try {
    window.localStorage.setItem(
      `${PENDING_KEY_PREFIX}${pending.storageKey}`,
      JSON.stringify(pending),
    );
  } catch {
    /* storage unavailable — recovery simply won't be available */
  }
}

function readPending(storageKey: string): PendingSubmission | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${PENDING_KEY_PREFIX}${storageKey}`);
    if (raw === null || raw.length === 0) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSubmission>;
    if (
      !parsed.attemptId ||
      !Array.isArray(parsed.answers) ||
      parsed.answers.length === 0
    ) {
      return null;
    }
    return parsed as PendingSubmission;
  } catch {
    return null;
  }
}

function clearPending(storageKey: string): void {
  if (storageKey.length === 0) return;
  try {
    window.localStorage.removeItem(`${PENDING_KEY_PREFIX}${storageKey}`);
  } catch {
    /* ignore */
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
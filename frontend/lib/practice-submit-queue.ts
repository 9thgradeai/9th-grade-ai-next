"use client";

// Offline-safe outbox for quick-practice submissions. Quick practice has no
// server attempt row, so a failed submit must never silently drop answers:
// the payload is queued in localStorage and retried when connectivity
// returns. Exactly one pending payload is kept (latest wins) — resubmitting
// the same answers is idempotent because grading is a pure function of the
// payload, not of attempt identity.

export type QueuedPracticeSubmit = {
  answers: { questionId: number; selected: string | string[] }[];
  ecosystem: string;
  queuedAt: number;
};

const QUEUE_KEY = "ninth-grade-ai:practice:submit-queue";

export function queuePracticeSubmit(payload: QueuedPracticeSubmit): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable — caller still shows the error state */
  }
}

export function loadQueuedPracticeSubmit(): QueuedPracticeSubmit | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueuedPracticeSubmit;
    if (!Array.isArray(parsed.answers) || parsed.answers.length === 0) {
      localStorage.removeItem(QUEUE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(QUEUE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearQueuedPracticeSubmit(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export function isNetworkFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("NETWORK_ERROR") ||
    msg.includes("TIMEOUT") ||
    msg.includes("timed out") ||
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    (typeof navigator !== "undefined" && navigator.onLine === false)
  );
}

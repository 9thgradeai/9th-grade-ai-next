"use client";

// Central manager for in-progress exam snapshots (P1b).
// Three exam surfaces (quick-practice, mock, custom) each persisted under
// their own key with raw JSON.parse — switching modes could resurrect a
// stale exam, and corrupt payloads threw. This module is the single seam:
// validated loads, versioned writes, cross-clear on start, storage-event fan-out.

export const QUICK_EXAM_KEY = "ninth-grade-ai:practice:quick";
export const MOCK_EXAM_KEY = "ninth-grade-ai:mock-test:active";
export const CUSTOM_EXAM_KEY = "ninth-grade-ai:exam:active";

export const EXAM_PERSIST_KEYS = [QUICK_EXAM_KEY, MOCK_EXAM_KEY, CUSTOM_EXAM_KEY] as const;
export type ExamPersistKey = (typeof EXAM_PERSIST_KEYS)[number];

const PERSIST_VERSION = 1;

type WithQuestions = { questions?: unknown; v?: number };

function isValidSnapshot<T extends WithQuestions>(value: unknown): value is T {
  if (typeof value !== "object" || value === null) return false;
  const v = value as WithQuestions;
  return Array.isArray(v.questions) && v.questions.length > 0;
}

/** Validated load — returns null (and drops the key) on missing/corrupt data. */
export function loadExamSnapshot<T extends WithQuestions>(key: ExamPersistKey): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    if (!isValidSnapshot<T>(parsed)) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return null;
    }
    return parsed;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    return null;
  }
}

/** Versioned write — stamps {v} alongside the payload (backwards compatible). */
export function saveExamSnapshot<T extends object>(key: ExamPersistKey, snapshot: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify({ ...snapshot, v: PERSIST_VERSION }));
  } catch {
    /* storage full/unavailable — resume just won't be available */
  }
}

export function dropExamSnapshot(key: ExamPersistKey): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Cross-clear: starting an exam in one mode must never resurrect a stale
 * snapshot from another mode. Call with the mode being started.
 */
export function clearOtherExams(keep: ExamPersistKey): void {
  for (const key of EXAM_PERSIST_KEYS) {
    if (key !== keep) dropExamSnapshot(key);
  }
}

export type ExamPersistListener = (activeKey: ExamPersistKey | null) => void;
const listeners = new Set<ExamPersistListener>();

function activeKeyFromStorage(): ExamPersistKey | null {
  if (typeof window === "undefined") return null;
  for (const key of EXAM_PERSIST_KEYS) {
    try {
      if (localStorage.getItem(key)) return key;
    } catch {
      /* ignore */
    }
  }
  return null;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", () => {
    const active = activeKeyFromStorage();
    listeners.forEach((l) => {
      try {
        l(active);
      } catch {
        /* listener failure must not break storage sync */
      }
    });
  });
}

export function subscribeExamPersist(listener: ExamPersistListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

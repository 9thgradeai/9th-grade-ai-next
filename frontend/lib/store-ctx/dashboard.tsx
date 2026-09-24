"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { TabId } from "@/lib/data";

// ── State ──────────────────────────────────────────────────
// Only durable, cross-tab UI state lives here. All attempt-derived
// metrics (points, streak, accuracy, etc.) are server-authoritative and
// fetched per-tab via the API — never mirrored into this store.

type DashboardState = {
  activeTab: TabId;
  // Tab-scoped UI state that must survive tab switches/remounts.
  questionBankFilters: { query: string; category: string };
  // Current exam-ecosystem context (category slug, e.g. "bcs"). Null = all.
  // Client-side preparation context only — never overrides server data.
  examContext: string | null;
  // Cross-tab intents — consumed once by target tab then cleared.
  practiceIntent?: { subject?: string; mode?: "quick" | "mock" | "custom" } | null;
  mistakeIntent?: { subject?: string; status?: string } | null;
};

const STORAGE_KEY = "9th_grade_ai_store_v2";

const defaultState: DashboardState = {
  activeTab: "home",
  questionBankFilters: { query: "", category: "" },
  examContext: null,
  practiceIntent: null,
  mistakeIntent: null,
};

function loadState(): DashboardState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<DashboardState>;
    // URL is the source of truth for activeTab — never hydrate it from
    // storage, otherwise a shared/bookmarked ?tab= link loses to stale local.
    const activeTab = defaultState.activeTab;
    const questionBankFilters = parsed.questionBankFilters ?? defaultState.questionBankFilters;
    const examContext =
      typeof parsed.examContext === "string" && parsed.examContext.length > 0
        ? parsed.examContext
        : null;
    const practiceIntent = (parsed as DashboardState).practiceIntent ?? null;
    const mistakeIntent = (parsed as DashboardState).mistakeIntent ?? null;
    return { activeTab, questionBankFilters, examContext, practiceIntent, mistakeIntent };
  } catch {
    return defaultState;
  }
}

// ── External store ─────────────────────────────────────────

let storeState: DashboardState = defaultState;
let hydrated = false;
const listeners = new Set<() => void>();

function getSnapshot(): DashboardState {
  if (!hydrated && typeof window !== "undefined") {
    storeState = loadState();
    hydrated = true;
  }
  return storeState;
}
function getServerSnapshot(): DashboardState {
  return defaultState;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function saveState(state: DashboardState) {
  if (typeof window === "undefined") return;
  try {
    // Persist everything except activeTab (URL-owned).
    const { activeTab: _omit, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch {
    // storage full or unavailable
  }
}
function setStore(updater: (prev: DashboardState) => DashboardState) {
  storeState = updater(storeState);
  saveState(storeState);
  listeners.forEach((l) => l());
}

// ── Actions (module-stable references) ─────────────────────

function setActiveTab(tab: TabId) {
  setStore((prev) => (prev.activeTab === tab ? prev : { ...prev, activeTab: tab }));
}
function setQuestionBankFilters(filters: Partial<{ query: string; category: string }>) {
  setStore((prev) => ({
    ...prev,
    questionBankFilters: { ...prev.questionBankFilters, ...filters },
  }));
}
function setPracticeIntent(intent: DashboardState["practiceIntent"]) {
  setStore((prev) => ({ ...prev, practiceIntent: intent ?? null }));
}
function setExamContext(examContext: string | null) {
  setStore((prev) =>
    prev.examContext === examContext
      ? prev
      : {
          ...prev,
          examContext,
          // Exam context change invalidates cross-tab intents scoped to the
          // previous ecosystem — clear them so stale subjects never leak.
          practiceIntent: null,
          mistakeIntent: null,
        },
  );
}
function setMistakeIntent(intent: DashboardState["mistakeIntent"]) {
  setStore((prev) => ({ ...prev, mistakeIntent: intent ?? null }));
}
function clearIntents() {
  setStore((prev) => ({ ...prev, practiceIntent: null, mistakeIntent: null }));
}
function resetStore() {
  storeState = defaultState;
  saveState(storeState);
  listeners.forEach((l) => l());
}

const actions = { setActiveTab, setQuestionBankFilters, setPracticeIntent, setMistakeIntent, setExamContext, clearIntents, resetStore };
export type DashboardActions = typeof actions;

// ── Hook ───────────────────────────────────────────────────
// Per-selector isolation: components only re-render when the slice they
// select actually changes. The selector receives state + stable actions.

function useDashboardStoreWithSelector<T>(
  selector: (value: DashboardState & DashboardActions) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const lastRef = useRef<{ snap: DashboardState; value: T } | null>(null);
  // Server snapshot must be referentially stable across renders (React dev
  // errors "getServerSnapshot should be cached" when an inline selector
  // builds a fresh object per call). Compute once per mount.
  const serverCache = useRef<{ value: T } | null>(null);
  const selRef = useRef(selector);
  useEffect(() => {
    selRef.current = selector;
  }, [selector]);
  const getServerSelection = useCallback(() => {
    if (serverCache.current) return serverCache.current.value;
    const value = selRef.current({ ...getServerSnapshot(), ...actions });
    serverCache.current = { value };
    return value;
  }, []);
  const getSelection = useCallback(() => {
    const snap = getSnapshot();
    if (lastRef.current && lastRef.current.snap === snap) return lastRef.current.value;
    const value = selector({ ...snap, ...actions });
    if (lastRef.current && isEqual?.(lastRef.current.value, value)) {
      lastRef.current = { snap, value: lastRef.current.value };
      return lastRef.current.value;
    }
    lastRef.current = { snap, value };
    return value;
  }, [selector, isEqual]);
  return useSyncExternalStore(subscribe, getSelection, getServerSelection);
}

const defaultSelector = (v: DashboardState & DashboardActions) => v;

export function useDashboardStore(): DashboardState & DashboardActions;
export function useDashboardStore<T>(
  selector: (value: DashboardState & DashboardActions) => T,
  isEqual?: (a: T, b: T) => boolean,
): T;
export function useDashboardStore<T>(
  selector?: (value: DashboardState & DashboardActions) => T,
  isEqual?: ((a: T, b: T) => boolean) | undefined,
) {
  const sel = (selector ?? defaultSelector) as (value: DashboardState & DashboardActions) => T;
  return useDashboardStoreWithSelector<T>(sel, isEqual);
}

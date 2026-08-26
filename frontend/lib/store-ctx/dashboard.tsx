"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import { TABS, type TabId } from "@/lib/data";

// ── State ──────────────────────────────────────────────────
// Only durable, cross-tab UI state lives here. All attempt-derived
// metrics (points, streak, accuracy, etc.) are server-authoritative and
// fetched per-tab via the API — never mirrored into this store.

type DashboardState = {
  activeTab: TabId;
  // Tab-scoped UI state that must survive tab switches/remounts.
  questionBankFilters: { query: string; category: string };
};

const STORAGE_KEY = "9th_grade_ai_store_v2";

const defaultState: DashboardState = {
  activeTab: "home",
  questionBankFilters: { query: "", category: "" },
};

function loadState(): DashboardState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<DashboardState>;
    const activeTab =
      parsed.activeTab && TABS.some((t) => t.id === parsed.activeTab)
        ? (parsed.activeTab as TabId)
        : "home";
    const questionBankFilters = parsed.questionBankFilters ?? defaultState.questionBankFilters;
    return { activeTab, questionBankFilters };
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
function resetStore() {
  storeState = defaultState;
  saveState(storeState);
  listeners.forEach((l) => l());
}

const actions = { setActiveTab, setQuestionBankFilters, resetStore };
export type DashboardActions = typeof actions;

// ── Hook ───────────────────────────────────────────────────
// Per-selector isolation: components only re-render when the slice they
// select actually changes. The selector receives state + stable actions.

function useDashboardStoreWithSelector<T>(
  selector: (value: DashboardState & DashboardActions) => T,
  isEqual?: (a: T, b: T) => boolean,
): T {
  const lastRef = useRef<{ snap: DashboardState; value: T } | null>(null);
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
  const getServerSelection = useCallback(
    () => selector({ ...getServerSnapshot(), ...actions }),
    [selector],
  );
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

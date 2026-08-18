"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  useMemo,
} from "react";
import type { TabId } from "@/lib/data";
import type { Server } from "@/lib/types";
import { AppError } from "@/lib/errors";

// ── State ──────────────────────────────────────────────────

type DashboardState = {
  activeTab: TabId;
  bookmarkedQuestions: string[];
  mockTestScores: number[];
  totalPoints: number;
  streakCount: number;
  selectedTopics: string[];
  studyPlanProgress: Record<string, boolean>;
  flashcardsReviewed: number;
  aiQuestionsAsked: number;
  lastSyncedAt: string | null;
};

// ── Actions ────────────────────────────────────────────────

type DashboardActions = {
  setActiveTab: (tab: TabId) => void;
  toggleBookmark: (questionId: string) => void;
  addMockTestScore: (score: number) => void;
  setTotalPoints: (points: number) => void;
  incrementStreak: () => void;
  resetStreak: () => void;
  toggleTopic: (topic: string) => void;
  clearTopics: () => void;
  toggleStudyTask: (taskId: string) => void;
  incrementFlashcardsReviewed: () => void;
  incrementAIQuestionsAsked: () => void;
  resetStore: () => void;
  syncWithServer: () => Promise<void>;
};

// ── Persistence ────────────────────────────────────────────

const STORAGE_KEY = "9th_grade_ai_store";

const defaultState: DashboardState = {
  activeTab: "home",
  bookmarkedQuestions: [],
  mockTestScores: [],
  totalPoints: 91.6,
  streakCount: 0,
  selectedTopics: [],
  studyPlanProgress: {},
  flashcardsReviewed: 0,
  aiQuestionsAsked: 0,
  lastSyncedAt: null,
};

function loadState(): DashboardState {
  if (typeof window === "undefined") return defaultState;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    return { ...defaultState, ...parsed };
  } catch {
    return defaultState;
  }
}

function saveState(state: DashboardState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
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

function setStore(updater: (prev: DashboardState) => DashboardState) {
  storeState = updater(storeState);
  saveState(storeState);
  listeners.forEach((l) => l());
}

// ── Actions ────────────────────────────────────────────────

const actions: DashboardActions = {
  setActiveTab: (tab) => setStore((prev) => ({ ...prev, activeTab: tab })),
  toggleBookmark: (questionId) =>
    setStore((prev) => {
      const exists = prev.bookmarkedQuestions.includes(questionId);
      return {
        ...prev,
        bookmarkedQuestions: exists
          ? prev.bookmarkedQuestions.filter((id) => id !== questionId)
          : [...prev.bookmarkedQuestions, questionId],
      };
    }),
  addMockTestScore: (score) =>
    setStore((prev) => ({
      ...prev,
      mockTestScores: [...prev.mockTestScores, score],
      totalPoints: prev.totalPoints + score,
    })),
  setTotalPoints: (points) =>
    setStore((prev) => ({ ...prev, totalPoints: points })),
  incrementStreak: () =>
    setStore((prev) => ({ ...prev, streakCount: prev.streakCount + 1 })),
  resetStreak: () => setStore((prev) => ({ ...prev, streakCount: 0 })),
  toggleTopic: (topic) =>
    setStore((prev) => ({
      ...prev,
      selectedTopics: prev.selectedTopics.includes(topic)
        ? prev.selectedTopics.filter((t) => t !== topic)
        : [...prev.selectedTopics, topic],
    })),
  clearTopics: () => setStore((prev) => ({ ...prev, selectedTopics: [] })),
  toggleStudyTask: (taskId) =>
    setStore((prev) => ({
      ...prev,
      studyPlanProgress: {
        ...prev.studyPlanProgress,
        [taskId]: !prev.studyPlanProgress[taskId],
      },
    })),
  incrementFlashcardsReviewed: () =>
    setStore((prev) => ({
      ...prev,
      flashcardsReviewed: prev.flashcardsReviewed + 1,
    })),
  incrementAIQuestionsAsked: () =>
    setStore((prev) => ({
      ...prev,
      aiQuestionsAsked: prev.aiQuestionsAsked + 1,
    })),
  resetStore: () => {
    storeState = { ...defaultState, lastSyncedAt: null };
    saveState(storeState);
    listeners.forEach((l) => l());
  },
  syncWithServer: async () => {
    try {
      const res = await fetch("/api/progress", {
        method: "GET",
        credentials: "include",
        headers: { "x-request-id": crypto.randomUUID() },
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const error = new AppError(
          typeof body.error === "string" ? body.error : "Failed to sync progress.",
          body.code ?? `HTTP_${res.status}`,
          res.status,
        );
        throw error;
      }

      const data = (await res.json()) as { progress: Server.UserProgressDTO };
      const progress = data.progress;

      setStore((prev) => ({
        ...prev,
        totalPoints: progress.points,
        streakCount: progress.streak,
        lastSyncedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error("[DashboardStore] syncWithServer failed:", error);
    }
  },
};

// ── Context ────────────────────────────────────────────────

type DashboardContextType = DashboardState & DashboardActions;

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const syncWithServer = actions.syncWithServer;

  const value = useMemo<DashboardContextType>(
    () => ({ ...state, ...actions, syncWithServer }),
    [state, syncWithServer],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────

export function useDashboardStore(): DashboardContextType;
export function useDashboardStore<T>(
  selector: (state: DashboardContextType) => T,
): T;
export function useDashboardStore<T>(
  selector?: (state: DashboardContextType) => T,
) {
  const ctx = useContext(DashboardContext);
  if (ctx === undefined) {
    throw new Error("useDashboardStore must be used within a DashboardProvider");
  }
  return selector ? selector(ctx) : ctx;
}

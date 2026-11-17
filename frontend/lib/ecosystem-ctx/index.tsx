"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ExamEcosystemCode } from "@/lib/types";
import { invalidateCache } from "@/lib/services/api";

type EcosystemContextType = {
  ecosystem: ExamEcosystemCode;
  setEcosystem: (eco: ExamEcosystemCode) => void;
};

const EcosystemContext = createContext<EcosystemContextType | undefined>(undefined);

const ECOSYSTEM_KEY = "9th-grade-ai:ecosystem";
const DEFAULT_ECOSYSTEM: ExamEcosystemCode = "BCS";

function readEcosystem(): ExamEcosystemCode {
  if (typeof window === "undefined") return DEFAULT_ECOSYSTEM;
  try {
    const stored = localStorage.getItem(ECOSYSTEM_KEY);
    if (stored === "BCS" || stored === "BANGLADESH_BANK") return stored;
    return DEFAULT_ECOSYSTEM;
  } catch {
    return DEFAULT_ECOSYSTEM;
  }
}

function writeEcosystem(eco: ExamEcosystemCode) {
  try {
    localStorage.setItem(ECOSYSTEM_KEY, eco);
  } catch {
    /* storage unavailable */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

/**
 * Provides the active exam ecosystem (BCS / Bangladesh Bank) across the
 * dashboard. Persists to localStorage and syncs via storage events.
 *
 * NOTE: this is the API-scoping code (passed to examConfig/dailyQuiz/etc.),
 * NOT the dashboard store's `examContext` (a category slug like "bcs" used
 * by ExamSwitcher as UI preparation context). The two are intentionally
 * separate, do not merge them.
 */
export function EcosystemProvider({ children }: { children: React.ReactNode }) {
  const [ecosystem, setEcosystemState] = useState<ExamEcosystemCode>(readEcosystem);
  // Mirror of `ecosystem` so `setEcosystem` keeps a stable identity.
  const ecosystemRef = useRef(ecosystem);
  useEffect(() => {
    ecosystemRef.current = ecosystem;
  }, [ecosystem]);

  const setEcosystem = useCallback((eco: ExamEcosystemCode) => {
    if (eco === ecosystemRef.current) return;
    ecosystemRef.current = eco;
    writeEcosystem(eco);
    setEcosystemState(eco);
    // The ecosystem scopes every exam/question read. Cached GETs were fetched
    // under the previous ecosystem, so they must be dropped or the dashboard
    // keeps serving BCS-scoped data after switching to Bangladesh Bank.
    invalidateCache();
  }, []);

  // Memoized so unrelated parent renders don't cascade to all consumers.
  const value = useMemo(() => ({ ecosystem, setEcosystem }), [ecosystem, setEcosystem]);

  return (
    <EcosystemContext.Provider value={value}>
      {children}
    </EcosystemContext.Provider>
  );
}

export function useEcosystem(): EcosystemContextType {
  const ctx = useContext(EcosystemContext);
  if (ctx === undefined) {
    throw new Error("useEcosystem must be used within an EcosystemProvider");
  }
  return ctx;
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ExamEcosystemCode } from "@/lib/types";

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
 */
export function EcosystemProvider({ children }: { children: React.ReactNode }) {
  const [ecosystem, setEcosystemState] = useState<ExamEcosystemCode>(DEFAULT_ECOSYSTEM);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setEcosystemState(readEcosystem());
  }, []);

  const setEcosystem = useCallback((eco: ExamEcosystemCode) => {
    writeEcosystem(eco);
    setEcosystemState(eco);
  }, []);

  return (
    <EcosystemContext.Provider value={{ ecosystem, setEcosystem }}>
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

"use client";

import {
  createContext,
  useContext,
  useCallback,
  useSyncExternalStore,
  useEffect,
} from "react";

export type Language = "bn" | "en";

type LanguageContextType = {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LANGUAGE_KEY = "9th-grade-ai-lang";
const DEFAULT_LANG: Language = "bn";

function readLang(): Language {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    return stored === "en" || stored === "bn" ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

function getSnapshot(): Language {
  return readLang();
}

function getServerSnapshot(): Language {
  return DEFAULT_LANG;
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function writeLang(lang: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, lang);
  } catch {
    /* storage unavailable — ignore */
  }
  document.documentElement.lang = lang === "bn" ? "bn" : "en";
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("storage"));
  }
}

/**
 * UI language preference (বাংলা / English). Data DTOs carry paired
 * `{field}Bn` / `{field}En` values; components pick per the active language
 * via the exported `t()` helper so both renderings come from one source.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Keep <html lang> in sync for screen readers / font selection.
  useEffect(() => {
    document.documentElement.lang = lang === "bn" ? "bn" : "en";
  }, [lang]);

  const setLang = useCallback((next: Language) => writeLang(next), []);
  const toggleLang = useCallback(
    () => writeLang(readLang() === "bn" ? "en" : "bn"),
    [],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

/** Picks the Bangla or English variant of a bilingual pair. */
export function t(lang: Language, bn: string | undefined, en: string | undefined): string {
  const preferred = lang === "bn" ? bn : en;
  return preferred ?? bn ?? en ?? "";
}

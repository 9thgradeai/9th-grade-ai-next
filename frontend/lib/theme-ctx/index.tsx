"use client";

import { createContext, useContext, useEffect } from "react";

type Theme = "dark" | "light";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_KEY = "9th-grade-ai-theme";

// Public pages (landing, marketing, auth, navbar) ship a single unified dark
// design. Light/dark switching lives only inside the user dashboard (see
// `frontend/lib/dashboard-theme-ctx`). To preserve backwards compatibility with
// existing imports we keep `ThemeProvider` + `useTheme` exported, but they
// always resolve to "dark" and any persisted "light" preference is wiped so
// legacy users see the dark public design on next visit.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    try {
      localStorage.removeItem(THEME_KEY);
    } catch {
      /* storage unavailable — ignore */
    }
  }, []);

  const value: ThemeContextType = {
    theme: "dark",
    toggleTheme: () => {},
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    // Outside a provider (e.g. prerender/build) — return a stable dark default
    // so the dashboard-only theme remains the single source of truth.
    return { theme: "dark" as Theme, toggleTheme: () => {} };
  }
  return context;
}

"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

type DashboardTheme = "light" | "dark";

const DashboardThemeContext = createContext<{
  theme: DashboardTheme;
  setTheme: (theme: DashboardTheme) => void;
  toggleTheme: () => void;
} | undefined>(undefined);

const DASHBOARD_THEME_KEY = "9th-grade-ai-dashboard-theme";

function readStoredTheme(): DashboardTheme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(DASHBOARD_THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "light";
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<DashboardTheme>(readStoredTheme);

  // Sync the data-dashboard-theme attribute whenever theme changes
  useEffect(() => {
    document.documentElement.dataset.dashboardTheme = theme;
  }, [theme]);

  // Persist to localStorage whenever theme changes
  useEffect(() => {
    try {
      localStorage.setItem(DASHBOARD_THEME_KEY, theme);
    } catch {
      /* storage unavailable — ignore */
    }
  }, [theme]);

  const toggleTheme = () => {
    const next: DashboardTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.dispatchEvent(new Event("storage"));
  };

  return (
    <DashboardThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const context = useContext(DashboardThemeContext);
  if (context === undefined) {
    // During build/prerender, return light theme as default so the build succeeds.
    // The real theme will be available once the client-side dashboard layout mounts.
    return { theme: "light" as DashboardTheme, setTheme: () => {}, toggleTheme: () => {} };
  }
  const { theme, setTheme, toggleTheme } = context;
  return { theme, setTheme, toggleTheme };
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useDashboardTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative w-10 h-10 flex items-center justify-center rounded-lg border border-zinc-500/30 bg-zinc-500/5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/5 transition-colors"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} dashboard mode`}
    >
      {theme === "dark" ? (
        <Moon className="w-5 h-5" />
      ) : (
        <Sun className="w-5 h-5" />
      )}
    </button>
  );
}

export default function DashboardThemeProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardThemeProvider>{children}</DashboardThemeProvider>
  );
}
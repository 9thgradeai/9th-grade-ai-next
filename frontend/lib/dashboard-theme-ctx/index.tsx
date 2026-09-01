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
      className="relative w-10 h-10 flex items-center justify-center rounded-xl border text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-primary)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
      style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} dashboard mode`}
    >
      {theme === "dark" ? <Moon className="w-[18px] h-[18px]" /> : <Sun className="w-[18px] h-[18px]" />}
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
"use client";

import { createContext, useContext, useSyncExternalStore, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

type DashboardTheme = "light" | "dark";

const DashboardThemeContext = createContext<{
  theme: DashboardTheme;
  setTheme: (theme: DashboardTheme) => void;
  toggleTheme: () => void;
} | undefined>(undefined);

const DASHBOARD_THEME_KEY = "9th-grade-ai-dashboard-theme";

function readDashboardTheme(): DashboardTheme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem(DASHBOARD_THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "light";
}

// Explicitly typed snapshot functions so useSyncExternalStore infers DashboardTheme.
const getSnapshot: () => DashboardTheme = readDashboardTheme;
const getServerSnapshot: () => DashboardTheme = () => "light";

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  // The provider ALWAYS wraps its children so hooks like useTheme() never
  // throw (ThemeToggle is rendered unconditionally in the dashboard layout).
  // State is sourced from localStorage via useSyncExternalStore — this avoids
  // both the hydration mismatch and the "setState in effect" anti-pattern.
  const theme: DashboardTheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Apply the data-dashboard-theme attribute to scope dashboard styles.
  // This completely isolates the dashboard theme from the global html.light/html.dark rules.
  useEffect(() => {
    const dashboardDiv = document.querySelector("[data-dashboard-theme]");
    if (dashboardDiv) {
      ;(dashboardDiv as HTMLElement).dataset.dashboardTheme = theme;
    }
  }, [theme]);

  const setTheme = (theme: DashboardTheme) => {
    try {
      localStorage.setItem(DASHBOARD_THEME_KEY, theme);
    } catch {
      /* storage unavailable — ignore */
    }
    // Reflect immediately + notify other tabs.
    const dashboardDiv = document.querySelector("[data-dashboard-theme]");
    if (dashboardDiv) {
      ;(dashboardDiv as HTMLElement).dataset.dashboardTheme = theme;
    }
    document.dispatchEvent(new Event("storage"));
  };

  const toggleTheme = () => {
    const next: DashboardTheme = theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(DASHBOARD_THEME_KEY, next);
    } catch {
      /* storage unavailable — ignore */
    }
    // Reflect immediately + notify other tabs.
    const dashboardDiv = document.querySelector("[data-dashboard-theme]");
    if (dashboardDiv) {
      ;(dashboardDiv as HTMLElement).dataset.dashboardTheme = next;
    }
    document.dispatchEvent(new Event("storage"));
  };

  const providerValue = { theme, setTheme, toggleTheme };

  return (
    <DashboardThemeContext.Provider value={providerValue}>
      {children}
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const context = useContext(DashboardThemeContext);
  if (context === undefined) {
    throw new Error("useDashboardTheme must be used within a DashboardThemeProvider");
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
"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sun, Moon, Monitor } from "@phosphor-icons/react";

type ResolvedTheme = "light" | "dark";
type ThemePreference = "light" | "dark" | "system";

type DashboardThemeContextValue = {
  /** Resolved theme actually applied to the scope (never "system"). */
  theme: ResolvedTheme;
  /** Stored user preference — "system" follows the OS. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Back-compat: set an explicit theme. */
  setTheme: (t: ResolvedTheme) => void;
  /** Back-compat: flip the resolved theme (stores explicit preference). */
  toggleTheme: () => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | undefined>(undefined);

const DASHBOARD_THEME_KEY = "9th-grade-ai-dashboard-theme";

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(DASHBOARD_THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* storage unavailable — ignore */
  }
  return "system";
}

function resolveSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? resolveSystemTheme() : preference;
}

export function DashboardThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    typeof window === "undefined" ? "light" : resolveTheme(readStoredPreference()),
  );
  const scopeRef = useRef<HTMLDivElement>(null);

  // Apply resolved theme to the scope before paint (no FOUC) + color-scheme.
  useLayoutEffect(() => {
    const next = resolveTheme(preference);
    setResolved((prev) => (prev === next ? prev : next));
    const scope = scopeRef.current;
    if (scope) {
      scope.dataset.dashboardTheme = next;
      scope.style.colorScheme = next;
    }
  }, [preference]);

  // Follow OS changes while in "system" mode.
  useEffect(() => {
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mq.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  // Cross-tab sync: another tab changed the preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== DASHBOARD_THEME_KEY) return;
      const next = readStoredPreference();
      setPreferenceState(next);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(DASHBOARD_THEME_KEY, p);
    } catch {
      /* storage unavailable — ignore */
    }
  }, []);

  const setTheme = useCallback(
    (t: ResolvedTheme) => setPreference(t),
    [setPreference],
  );

  const toggleTheme = useCallback(() => {
    setPreferenceState((prev) => {
      const current = resolveTheme(prev);
      const next: ResolvedTheme = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(DASHBOARD_THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <DashboardThemeContext.Provider
      value={{ theme: resolved, preference, setPreference, setTheme, toggleTheme }}
    >
      <div ref={scopeRef} className="dashboard-theme-scope" data-dashboard-theme={resolved}>
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const context = useContext(DashboardThemeContext);
  if (context === undefined) {
    // During build/prerender, return light theme as default so the build succeeds.
    // The real theme will be available once the client-side dashboard layout mounts.
    const noop = () => {};
    return {
      theme: "light" as ResolvedTheme,
      preference: "system" as ThemePreference,
      setPreference: noop as (p: ThemePreference) => void,
      setTheme: noop as (t: ResolvedTheme) => void,
      toggleTheme: noop,
    };
  }
  return context;
}

export function ThemeToggle() {
  const { theme, preference, toggleTheme, setPreference } = useDashboardTheme();
  const cycling = preference === "system";

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={toggleTheme}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border text-[var(--dashboard-text-muted)] transition-colors hover:text-[var(--dashboard-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
        style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} dashboard mode`}
        title={cycling ? "Following system — click to set explicit mode" : undefined}
      >
        {theme === "dark" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
      </button>
      {cycling && (
        <button
          onClick={() => setPreference(theme)}
          className="hidden items-center justify-center rounded-lg border px-1.5 py-1 text-[10px] font-bold text-[var(--dashboard-text-muted)] sm:inline-flex"
          style={{ borderColor: "var(--dashboard-border-muted)" }}
          aria-label="Pin current system theme as explicit preference"
          title="Pin system theme"
        >
          <Monitor className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

export default function DashboardThemeProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardThemeProvider>{children}</DashboardThemeProvider>;
}

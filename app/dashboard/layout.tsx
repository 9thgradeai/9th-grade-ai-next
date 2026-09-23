/* src/app/dashboard/layout.tsx */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
/* framer-motion deferred — drawer uses CSS transitions */
import SideNav from "@/components/dashboard/SideNav";
import BottomNav from "@/components/dashboard/BottomNav";
import ExamSwitcher from "@/components/dashboard/ExamSwitcher";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import CommandBar from "@/components/dashboard/CommandBar";
import { ThemeToggle, DashboardThemeProvider } from "@/lib/dashboard-theme-ctx";
import { EcosystemProvider, useEcosystem } from "@/lib/ecosystem-ctx";
import { useAuth } from "@/lib/auth-ctx";
import { LoadingShell } from "@/components/ui/LoadingShell";

import { TABS, type TabId } from "@/lib/data";
import BrandMark from "@/components/ui/BrandMark";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { List, MagnifyingGlass, X, Question } from "@phosphor-icons/react";
import { TAB_ICONS } from "@/lib/exam-ui";
import { useAuth as useAuthForDrawer } from "@/lib/auth-ctx";
import LogoutButton from "@/components/dashboard/LogoutButton";
import { useT } from "@/lib/i18n";
import AIAssistantWidget from "@/components/dashboard/AIAssistantWidget";

// The voice tutor (speech-recognition stack) is only needed when launched —
// keep it out of the critical dashboard bundle.
const VoiceAITutor = dynamic(() => import("@/components/dashboard/VoiceAITutor"), {
  ssr: false,
});

// The AI coach's practice-drill modal is small but only needed when an agent
// action carries a server-minted question set — load it lazily too.
const PracticeDrillOverlay = dynamic(
  () => import("@/components/dashboard/ai/PracticeDrillOverlay"),
  { ssr: false },
);

const DRAWER_GROUPS: { label: string; ids: TabId[] }[] = [
  { label: "Primary", ids: ["home", "practice", "question-bank", "mistakes", "progress"] },
  { label: "Study", ids: ["study-planner", "flashcards", "vocab", "exam-history", "real-exam"] },
  { label: "Account", ids: ["settings"] },
];

function SideNavDrawerContent({ activeTab, onChange }: { activeTab: TabId; onChange: (t: TabId) => void }) {
  const { user } = useAuthForDrawer();
  const initial = user?.name?.charAt(0) ?? "G";
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3">
        <ExamSwitcher />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        {DRAWER_GROUPS.map((group) => {
          const tabs = group.ids.map((id) => TABS.find((t) => t.id === id)!).filter(Boolean);
          if (!tabs.length) return null;
          return (
            <div key={group.label} className="mb-1">
              <p className="px-3 pt-5 pb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--dashboard-text-secondary)", opacity: 0.82 }}>{group.label}</p>
              <div className="space-y-0.5">
                {tabs.map((tab) => {
                  const Icon = TAB_ICONS[tab.id];
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => onChange(tab.id)}
                      aria-current={isActive ? "page" : undefined}
                      className="relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                      style={isActive ? { background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", border: "1px solid color-mix(in srgb, var(--dashboard-primary) 16%, transparent)" } : { color: "var(--dashboard-text-primary)", border: "1px solid transparent" }}
                    >
                      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" />}
                      <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.9} style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)" }} />
                      <span className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold leading-none truncate" style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-primary)" }}>{tab.label}</span>
                        <span className="text-[11px] leading-none mt-1 truncate font-medium" style={{ color: isActive ? "var(--dashboard-primary)" : "var(--dashboard-text-secondary)", opacity: isActive ? 0.82 : 0.88 }}>{tab.bengali}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t px-3 py-4 space-y-3" style={{ borderColor: "var(--dashboard-sidebar-border)" }}>
        <div className="flex items-center gap-3 px-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold border" style={{ background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)", borderColor: "var(--dashboard-border-muted)" }}>{initial}</div>
          <div className="min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: "var(--dashboard-text-primary)" }}>{user?.name ?? "Guest"}</p>
            <p className="text-[11px] truncate" style={{ color: "var(--dashboard-text-muted)" }}>@{user?.handle ?? "student"}</p>
          </div>
        </div>
        <div className="pt-2 border-t" style={{ borderColor: "var(--dashboard-border-muted)" }}>
          <LogoutButton aria-label="Log out" />
        </div>
      </div>
    </div>
  );
}

function EmailVerificationGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  // Gate: require email verification before accessing dashboard. Carry the
  // user's email so the verify page can prefill the "resend" box.
  useEffect(() => {
    if (!authLoading && user && !user.emailVerified) {
      router.replace(`/verify-email?email=${encodeURIComponent(user.email)}`);
    }
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="dashboard-shell min-h-dvh flex items-center justify-center p-4">
        <LoadingShell title="VERIFYING_CREDENTIALS" progressLabel="auth check" className="w-full max-w-[560px]" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!user.emailVerified) {
    return (
      <div className="dashboard-shell min-h-dvh flex items-center justify-center p-4">
        <LoadingShell title="REDIRECTING_VERIFICATION" progressLabel="redirect" className="w-full max-w-[560px]" />
      </div>
    );
  }

  return <>{children}</>;
}

function GlobalEcosystemToggle() {
  const { ecosystem, setEcosystem } = useEcosystem();
  return (
    <div
      className="flex items-center gap-1 sm:gap-1.5 bg-[var(--dashboard-surface-muted)] border border-[var(--dashboard-border-muted)] rounded-lg p-0.5 shrink-0"
      role="group"
      aria-label="Exam ecosystem"
    >
      {(["BCS", "BANGLADESH_BANK"] as const).map((code) => (
        <button
          key={code}
          onClick={() => setEcosystem(code)}
          aria-pressed={ecosystem === code}
          aria-label={code === "BCS" ? "BCS" : "বাংলাদেশ ব্যাংক"}
          className={`min-h-[28px] sm:min-h-[30px] px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] focus-visible:ring-offset-1 ${ecosystem === code ? "bg-[var(--dashboard-primary)] text-white shadow-sm" : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)] hover:bg-[var(--surface-hover)]"}`}
        >
          {code === "BCS" ? "BCS" : "ব্যাংক"}
        </button>
      ))}
    </div>
  );
}

function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "var(--dashboard-overlay)" }} onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative w-full max-w-md rounded-2xl border shadow-xl p-5" style={{ background: "var(--dashboard-surface-solid)", borderColor: "var(--dashboard-border-muted)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>Keyboard shortcuts</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: "var(--dashboard-text-muted)" }} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span style={{ color: "var(--dashboard-text-secondary)" }}>Command palette</span><kbd className="px-1.5 py-0.5 rounded border text-xs font-mono" style={{ borderColor: "var(--dashboard-border-muted)" }}>⌘K</kbd></div>
          <div className="flex justify-between"><span style={{ color: "var(--dashboard-text-secondary)" }}>Jump to tab 1–9, 10=0</span><kbd className="px-1.5 py-0.5 rounded border text-xs font-mono" style={{ borderColor: "var(--dashboard-border-muted)" }}>1 – 0</kbd></div>
          <div className="flex justify-between"><span style={{ color: "var(--dashboard-text-secondary)" }}>Search in question bank</span><kbd className="px-1.5 py-0.5 rounded border text-xs font-mono" style={{ borderColor: "var(--dashboard-border-muted)" }}>/</kbd></div>
          <p className="text-xs pt-2" style={{ color: "var(--dashboard-text-muted)" }}>Press <kbd className="font-mono">?</kbd> again or <kbd className="font-mono">Esc</kbd> to close.</p>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useT();
  const router = useRouter();
  const { activeTab, setActiveTab } = useDashboardStore();
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeNavDrawer = useCallback(() => setNavDrawerOpen(false), []);
  const drawerRef = useDialogA11y<HTMLDivElement>(navDrawerOpen, closeNavDrawer);

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "DASHBOARD";

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.push(`/dashboard?tab=${tab}`);
    closeNavDrawer();
  };

  // Keyboard shortcuts: 1-9/0 to switch tabs, Cmd+K for command bar, ? for help
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        setShortcutsOpen((o) => !o);
        return;
      }
      if (e.key === "Escape" && shortcutsOpen) {
        setShortcutsOpen(false);
        return;
      }
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Don't hijack keys while a dialog (command palette, sheets) is open
      if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;

      // Number keys 1-9 for the first nine tabs, 0 for the tenth
      const num = parseInt(e.key);
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const idx = e.key === "0" ? 9 : num >= 1 && num <= 9 ? num - 1 : -1;
        if (idx >= 0) {
          const tab = TABS[idx];
          if (tab) {
            handleTabChange(tab.id);
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutsOpen]);

  return (
    <DashboardThemeProvider>
      <EcosystemProvider>
      <EmailVerificationGate>
          <div className="dashboard-shell h-dvh overflow-hidden flex" style={{ background: "var(--dashboard-background)" }}>
            {/* Skip link — first focusable element for keyboard users */}
            <a
              href="#dashboard-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-500 focus:text-zinc-950 focus:font-mono focus:text-sm"
            >
              {t("dashboard.skipToContent")}
            </a>

            {/* Desktop Side Navigation (>=1024px) — locked column, never scrolls away */}
            <SideNav activeTab={activeTab} onChange={handleTabChange} />

            {/* Tablet/Mobile Drawer — makes left tab sections fully visible on <lg */}
            {navDrawerOpen && (
              <div
                className="fixed inset-0 z-50 lg:hidden"
                role="dialog"
                aria-modal="true"
                aria-label="Navigation menu"
              >
                <div className="absolute inset-0 backdrop-blur-sm animate-fade-in" style={{ background: "var(--dashboard-overlay)" }} onClick={closeNavDrawer} />
                <div
                  ref={drawerRef}
                  tabIndex={-1}
                  role="document"
                  className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[86vw] border-r shadow-2xl flex flex-col overflow-hidden animate-slide-in-left"
                  style={{ background: "var(--dashboard-sidebar-bg)", borderColor: "var(--dashboard-sidebar-border)" }}
                >
                  <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--dashboard-sidebar-border)" }}>
                    <div className="flex items-center gap-3">
                      <BrandMark className="h-8 w-8 rounded-lg ring-1 ring-black/5" />
                      <span className="font-display font-bold text-[15px]" style={{ color: "var(--dashboard-text-primary)" }}>9Th-Grade AI</span>
                    </div>
                    <button onClick={closeNavDrawer} className="p-2 rounded-xl border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }} aria-label="Close navigation">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Reuse same grouped nav inline for drawer — avoids duplicating SideNav hidden logic */}
                    <SideNavDrawerContent activeTab={activeTab} onChange={handleTabChange} />
                  </div>
                </div>
              </div>
            )}

            {/* Main Column */}
            <div className="flex-1 min-w-0 flex flex-col h-full">
              {/* Fixed Top Header — academic premium */}
              <header className="shrink-0 z-30 border-b pt-safe backdrop-blur-md" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6 h-14 lg:h-16 min-w-0">
                  {/* Hamburger — visible on tablet + mobile (<lg) to expose left tabs */}
                  <button
                    onClick={() => setNavDrawerOpen(true)}
                    className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-primary)" }}
                    aria-label="Open navigation"
                    aria-expanded={navDrawerOpen}
                    aria-controls="dashboard-nav-drawer"
                  >
                    <List className="w-5 h-5" />
                  </button>
                  {/* Mobile logo — text hides on very narrow screens to keep toggle + actions visible */}
                  <Link
                    href="/"
                    className="lg:hidden flex items-center gap-2 font-display font-bold text-[15px] min-w-0 shrink-0"
                    style={{ color: "var(--dashboard-text-primary)" }}
                    aria-label="9Th-Grade AI home"
                  >
                    <BrandMark className="h-8 w-8 rounded-lg ring-1 ring-black/5 shrink-0" />
                    <span className="hidden min-[360px]:inline truncate">9Th-Grade AI</span>
                  </Link>

                  {/* Desktop page title — clean, no terminal $ */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                    aria-label="Search dashboard"
                    className="hidden sm:flex h-10 w-64 items-center gap-3 rounded-lg border px-3 text-sm text-[var(--dashboard-text-secondary)] bg-[var(--dashboard-surface-muted)] border-[var(--dashboard-border-muted)] hover:border-[var(--dashboard-primary)] transition-colors"
                  >
                    <MagnifyingGlass className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t("dashboard.controlCenter")}</span>
                    <kbd className="ml-auto hidden lg:inline-flex items-center gap-1 rounded bg-[var(--dashboard-surface)] border border-[var(--dashboard-border-muted)] px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
                  </button>
                  <span className="hidden xl:block text-xs text-[var(--dashboard-text-muted)] truncate max-w-[160px]">{activeLabel}</span>

                  <div className="ml-auto flex items-center gap-1 sm:gap-1.5 min-w-0 shrink-0">
                    <GlobalEcosystemToggle />
                    <button onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" className="hidden sm:inline-flex items-center justify-center w-8 h-8 rounded-lg border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}><Question className="w-4 h-4" /></button>
                    <NotificationCenter />
                    <ThemeToggle />
                    <LanguageToggle />
                  </div>
                </div>
              </header>

              {/* Scrollable Content — isolated dashboard canvas */}
              <main id="dashboard-content" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[72px] lg:pb-8" style={{ background: "var(--dashboard-background)" }}>
                <div className="max-w-[1360px] mx-auto p-4 sm:p-6 lg:p-8 min-w-0">
                  {children}
                </div>
              </main>
            </div>

            {/* Mobile Bottom Navigation (<1024px) */}
            <BottomNav activeTab={activeTab} onChange={handleTabChange} />

            {/* Global Components */}
            <VoiceAITutor />
            <PracticeDrillOverlay />
            <CommandBar />
            <ShortcutsSheet open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
            <AIAssistantWidget />
            </div>
        </EmailVerificationGate>
      </EcosystemProvider>
    </DashboardThemeProvider>
  );
}
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

import { TABS, NAV_GROUPS, type TabId } from "@/lib/data";
import BrandMark from "@/components/ui/BrandMark";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { List, MagnifyingGlass, X, Question } from "@phosphor-icons/react";
import LogoutButton from "@/components/dashboard/LogoutButton";
import NavRows from "@/components/dashboard/NavRows";
import ShortcutList from "@/components/dashboard/ShortcutList";
import WorldMapBackdrop from "@/components/dashboard/WorldMapBackdrop";
import { useT } from "@/lib/i18n";
import { useLanguage, t as pickLang } from "@/lib/lang-ctx";

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

// Drawer reuses the shared NavRows source — zero row-markup duplication
// with SideNav (Phase 2 shell dedup).
function SideNavDrawerContent({ activeTab, onChange }: { activeTab: TabId; onChange: (t: TabId) => void }) {
  const { user } = useAuth();
  const initial = user?.name?.charAt(0) ?? "G";
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3">
        <ExamSwitcher />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <NavRows activeTab={activeTab} onChange={onChange} variant="drawer" />
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
  const { lang } = useLanguage();
  return (
    <div
      className="flex items-center gap-1 bg-[var(--dashboard-surface-muted)] border border-[var(--dashboard-border-muted)] rounded-xl p-1 shrink-0"
      role="group"
      aria-label={pickLang(lang, "পরীক্ষা ইকোসিস্টেম", "Exam ecosystem")}
    >
      {(["BCS", "BANGLADESH_BANK"] as const).map((code) => (
        <button
          key={code}
          onClick={() => setEcosystem(code)}
          aria-pressed={ecosystem === code}
          aria-label={code === "BCS" ? "BCS" : pickLang(lang, "বাংলাদেশ ব্যাংক", "Bangladesh Bank")}
          className={`min-h-[40px] min-w-[52px] px-3 py-1 text-xs font-bold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)] ${ecosystem === code ? "bg-[var(--dashboard-primary)] text-white shadow-sm" : "text-[var(--dashboard-text-secondary)] hover:text-[var(--dashboard-text-primary)]"}`}
        >
          {code === "BCS" ? "BCS" : pickLang(lang, "ব্যাংক", "Bank")}
        </button>
      ))}
    </div>
  );
}

function ShortcutsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useDialogA11y<HTMLDivElement>(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "var(--dashboard-overlay)" }} onClick={onClose} />
      <div ref={ref} tabIndex={-1} className="relative w-full max-w-md rounded-2xl border shadow-xl p-5" style={{ background: "var(--dashboard-surface-solid)", borderColor: "var(--dashboard-border-muted)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>Keyboard shortcuts</h2>
          <button onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: "var(--dashboard-text-muted)" }} aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {/* Unified global map — same content as the HomeTab cheat-sheet (ShortcutList). */}
        <div className="mt-4">
          <ShortcutList />
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

  const activeMeta = TABS.find((t) => t.id === activeTab);
  const activeGroup = NAV_GROUPS.find((g) => g.ids.includes(activeTab));

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    router.push(`/dashboard?tab=${tab}`);
    closeNavDrawer();
    // setActiveTab is a module-stable store action; router/closeNavDrawer are
    // stable across renders, so this callback identity never churns.
  }, [router, closeNavDrawer, setActiveTab]);

  // Global shortcuts (Phase 5 unified map): 1-9/0 tabs, ? help, Esc close.
  // ⌘K lives in CommandBar. No single-letter hijacks anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
        // Don't hijack keys while a dialog (command palette, sheets) is open.
        if (e.target instanceof HTMLElement && e.target.closest('[role="dialog"]')) return;
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
  }, [shortcutsOpen, handleTabChange]);

  return (
    <DashboardThemeProvider>
      <EcosystemProvider>
      <EmailVerificationGate>
          <div className="dashboard-shell h-dvh overflow-hidden flex" style={{ background: "var(--dashboard-background)" }}>
            {/* Ambient world map (desktop only, decorative, non-interactive) */}
            <WorldMapBackdrop />
            {/* Skip link — first focusable element for keyboard users */}
            <a
              href="#dashboard-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-tooltip)] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-500 focus:text-zinc-950 focus:font-mono focus:text-sm"
            >
              {t("dashboard.skipToContent")}
            </a>

            {/* Desktop Side Navigation (>=1024px) — locked column, never scrolls away */}
            <SideNav activeTab={activeTab} onChange={handleTabChange} />

            {/* Tablet/Mobile Drawer — makes left tab sections fully visible on <lg */}
            {navDrawerOpen && (
              <div
                className="fixed inset-0 z-[var(--z-modal)] lg:hidden"
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
              {/* Fixed Top Header — Phase 2: breadcrumb left, search center, actions right */}
              <header className="shrink-0 z-[var(--z-sticky)] border-b pt-safe backdrop-blur-md" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
                <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 lg:px-6 h-16 min-w-0">
                  {/* Hamburger — visible on tablet + mobile (<lg) to expose left tabs */}
                  <button
                    onClick={() => setNavDrawerOpen(true)}
                    className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-primary)" }}
                    aria-label="Open navigation"
                    aria-expanded={navDrawerOpen}
                    aria-controls="dashboard-nav-drawer"
                  >
                    <List className="w-5 h-5" />
                  </button>
                  {/* Mobile logo icon only — text removed to keep search + actions visible on 320px */}
                  <Link
                    href="/"
                    className="lg:hidden flex items-center min-w-0 shrink-0"
                    style={{ color: "var(--dashboard-text-primary)" }}
                    aria-label="9Th-Grade AI home"
                  >
                    <BrandMark className="h-8 w-8 rounded-lg ring-1 ring-black/5 shrink-0" />
                  </Link>

                  {/* Breadcrumb — desktop: group › tab (replaces bare activeLabel) */}
                  <nav aria-label="Breadcrumb" className="hidden lg:flex min-w-0 shrink-0 items-center gap-1.5 text-[13px]">
                    <span className="shrink-0 font-medium" style={{ color: "var(--dashboard-text-muted)" }}>
                      {activeGroup?.label ?? "Dashboard"}
                    </span>
                    <span aria-hidden="true" style={{ color: "var(--dashboard-text-muted)" }}>›</span>
                    <span className="truncate font-bold" style={{ color: "var(--dashboard-text-primary)" }}>
                      {activeMeta ? `${activeMeta.bengali} · ${activeMeta.label}` : "DASHBOARD"}
                    </span>
                  </nav>

                  {/* Command trigger — fluid center (icon-only on xs) */}
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                    aria-label="Search dashboard"
                    aria-haspopup="dialog"
                    className="hidden sm:flex h-10 flex-1 max-w-md items-center gap-3 rounded-xl border px-3 text-sm text-[var(--dashboard-text-secondary)] bg-[var(--dashboard-surface-muted)] border-[var(--dashboard-border-muted)] hover:border-[var(--dashboard-primary)] transition-colors"
                  >
                    <MagnifyingGlass className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t("dashboard.controlCenter")}</span>
                    <kbd className="ml-auto hidden lg:inline-flex items-center gap-1 rounded bg-[var(--dashboard-surface)] border border-[var(--dashboard-border-muted)] px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
                  </button>
                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                    aria-label="Search dashboard"
                    aria-haspopup="dialog"
                    className="sm:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl border shrink-0"
                    style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-secondary)" }}
                  >
                    <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="ml-auto flex items-center gap-1.5 min-w-0 shrink-0">
                    <GlobalEcosystemToggle />
                    <button onClick={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts" className="hidden md:inline-flex items-center justify-center w-10 h-10 rounded-xl border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}><Question className="w-4 h-4" /></button>
                    <NotificationCenter />
                    <ThemeToggle />
                    <LanguageToggle />
                  </div>
                </div>
              </header>

              {/* Scrollable Content — isolated dashboard canvas. Transparent so
                  the ambient world map shows through the gutters; the shell
                  behind it keeps the base background color. */}
              <main id="dashboard-content" className="relative z-[1] flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+8px)] lg:pb-8" style={{ background: "transparent" }}>
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
            </div>
        </EmailVerificationGate>
      </EcosystemProvider>
    </DashboardThemeProvider>
  );
}
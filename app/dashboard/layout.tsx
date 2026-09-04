/* src/app/dashboard/layout.tsx */
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MotionConfig, AnimatePresence, motion } from "framer-motion";
import SideNav from "@/components/dashboard/SideNav";
import BottomNav from "@/components/dashboard/BottomNav";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import CommandBar from "@/components/dashboard/CommandBar";
import { useDashboardTheme, ThemeToggle, DashboardThemeProvider } from "@/lib/dashboard-theme-ctx";
import { useAuth } from "@/lib/auth-ctx";
import { AuroraRing, StatusText } from "@/components/ui/Loader";

import { TABS, type TabId } from "@/lib/data";
import BrandMark from "@/components/ui/BrandMark";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

import { useDialogA11y } from "@/lib/use-dialog-a11y";
import { Menu, X } from "lucide-react";
import { TAB_ICONS } from "@/lib/exam-ui";
import { useAuth as useAuthForDrawer } from "@/lib/auth-ctx";
import LogoutButton from "@/components/dashboard/LogoutButton";

// The voice tutor (speech-recognition stack) is only needed when launched —
// keep it out of the critical dashboard bundle.
const VoiceAITutor = dynamic(() => import("@/components/dashboard/VoiceAITutor"), {
  ssr: false,
});

const DRAWER_GROUPS: { label: string; ids: TabId[] }[] = [
  { label: "Primary", ids: ["home", "practice", "question-bank", "mistakes", "progress"] },
  { label: "Study", ids: ["study-planner", "flashcards"] },
  { label: "Account", ids: ["settings"] },
];

function SideNavDrawerContent({ activeTab, onChange }: { activeTab: TabId; onChange: (t: TabId) => void }) {
  const { user } = useAuthForDrawer();
  const initial = user?.name?.charAt(0) ?? "G";
  return (
    <div className="flex flex-col h-full">
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
      <div className="dashboard-shell min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <AuroraRing size={72} label="Verifying credentials" />
          <div className="flex items-center gap-3 font-mono text-sm" style={{ color: "var(--dashboard-primary)" }}>
            <StatusText
              messages={["verifying credentials", "checking session", "securing access"]}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (!user.emailVerified) {
    return (
      <div className="dashboard-shell min-h-dvh flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <AuroraRing size={72} label="Redirecting to email verification" />
          <div className="flex items-center gap-3 font-mono text-sm" style={{ color: "var(--dashboard-primary)" }}>
            <StatusText
              messages={["email verification required", "redirecting to verification"]}
            />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeTab, setActiveTab } = useDashboardStore();
  const { theme: dashboardTheme, toggleTheme, setTheme } = useDashboardTheme();
  const [navDrawerOpen, setNavDrawerOpen] = useState(false);
  const closeNavDrawer = useCallback(() => setNavDrawerOpen(false), []);
  const drawerRef = useDialogA11y<HTMLDivElement>(navDrawerOpen, closeNavDrawer);

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "DASHBOARD";

  // Initialize dashboard theme attribute on mount, and ensure the
  // global <html> theme is NOT affected by dashboard theme changes.
  useEffect(() => {
    // Set data-dashboard-theme attribute on the documentElement so the
    // scoped CSS rules [data-dashboard-theme="light"] / [data-dashboard-theme="dark"]
    // take effect. This completely isolates the dashboard theme from the global
    // html.light/html.dark rules that affect other pages.
    document.documentElement.dataset.dashboardTheme = dashboardTheme;
  }, [dashboardTheme]);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.push(`/dashboard?tab=${tab}`);
    closeNavDrawer();
  };

  // Keyboard shortcuts: 1-8 to switch tabs, Cmd+K for command bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      
      // Number keys 1-8 for tab switching
      const num = parseInt(e.key);
      if (num >= 1 && num <= 8 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const tab = TABS[num - 1];
        if (tab) {
          handleTabChange(tab.id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DashboardThemeProvider>
      <EmailVerificationGate>
          <MotionConfig reducedMotion="user">
            <div className="dashboard-shell h-dvh overflow-hidden flex" style={{ background: "var(--dashboard-background)" }}>
            {/* Skip link — first focusable element for keyboard users */}
            <a
              href="#dashboard-content"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-500 focus:text-zinc-950 focus:font-mono focus:text-sm"
            >
              Skip to content
            </a>

            {/* Desktop Side Navigation (>=1024px) — locked column, never scrolls away */}
            <SideNav activeTab={activeTab} onChange={handleTabChange} />

            {/* Tablet/Mobile Drawer — makes left tab sections fully visible on <lg */}
            <AnimatePresence>
              {navDrawerOpen && (
                <motion.div
                  className="fixed inset-0 z-50 lg:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation menu"
                >
                  <div className="absolute inset-0 backdrop-blur-sm" style={{ background: "var(--dashboard-overlay)" }} onClick={closeNavDrawer} />
                  <motion.div
                    ref={drawerRef}
                    tabIndex={-1}
                    role="document"
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", stiffness: 340, damping: 32 }}
                    className="absolute left-0 top-0 bottom-0 w-[300px] max-w-[86vw] border-r shadow-2xl flex flex-col overflow-hidden"
                    style={{ background: "var(--dashboard-sidebar-bg)", borderColor: "var(--dashboard-sidebar-border)" }}
                  >
                    <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--dashboard-sidebar-border)" }}>
                      <div className="flex items-center gap-3">
                        <BrandMark className="h-8 w-8 rounded-lg ring-1 ring-black/5" />
                        <span className="font-display font-bold text-[15px]" style={{ color: "var(--dashboard-text-primary)" }}>9th-grade-ai</span>
                      </div>
                      <button onClick={closeNavDrawer} className="p-2 rounded-xl border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-secondary)", background: "var(--dashboard-surface-muted)" }} aria-label="Close navigation">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      {/* Reuse same grouped nav inline for drawer — avoids duplicating SideNav hidden logic */}
                      <SideNavDrawerContent activeTab={activeTab} onChange={handleTabChange} />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main Column */}
            <div className="flex-1 min-w-0 flex flex-col h-full">
              {/* Fixed Top Header — academic premium */}
              <header className="shrink-0 z-30 border-b pt-safe backdrop-blur-md" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
                <div className="flex items-center gap-3 px-4 sm:px-6 h-14 lg:h-16">
                  {/* Hamburger — visible on tablet + mobile (<lg) to expose left tabs */}
                  <button
                    onClick={() => setNavDrawerOpen(true)}
                    className="lg:hidden inline-flex items-center justify-center w-9 h-9 rounded-xl border shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                    style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-primary)" }}
                    aria-label="Open navigation"
                    aria-expanded={navDrawerOpen}
                    aria-controls="dashboard-nav-drawer"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
                  {/* Mobile logo */}
                  <Link
                    href="/"
                    className="lg:hidden flex items-center gap-2.5 font-display font-bold text-[15px]"
                    style={{ color: "var(--dashboard-text-primary)" }}
                    aria-label="9th-grade-ai home"
                  >
                    <BrandMark className="h-8 w-8 rounded-lg ring-1 ring-black/5" />
                    <span>9th-grade-ai</span>
                  </Link>

                  {/* Desktop page title — clean, no terminal $ */}
                  <div className="hidden lg:flex flex-col">
                    <span className="text-[13px] font-semibold tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>{activeLabel}</span>
                    <span className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>আপনার পড়াশোনার কন্ট্রোল সেন্টার</span>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                      aria-label="কমান্ড প্যানেল খুলুন"
                      className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors"
                      style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}
                    >
                      <span>⌘K</span>
                    </button>
                    <NotificationCenter />
                    <ThemeToggle />
                    <LanguageToggle />
                  </div>
                </div>
              </header>

              {/* Scrollable Content — isolated dashboard canvas */}
              <main id="dashboard-content" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-40 lg:pb-8" style={{ background: "var(--dashboard-background)" }}>
                <div className="max-w-[1360px] mx-auto p-4 sm:p-6 lg:p-8 min-w-0">
                  {children}
                </div>
              </main>
            </div>

            {/* Mobile Bottom Navigation (<1024px) */}
            <BottomNav activeTab={activeTab} onChange={handleTabChange} />

            {/* Global Components */}
            <VoiceAITutor />
            <CommandBar />
            </div>
          </MotionConfig>
        </EmailVerificationGate>
    </DashboardThemeProvider>
  );
}
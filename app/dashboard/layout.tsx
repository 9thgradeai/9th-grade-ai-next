/* src/app/dashboard/layout.tsx */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { MotionConfig } from "framer-motion";
import SideNav from "@/components/dashboard/SideNav";
import BottomNav from "@/components/dashboard/BottomNav";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import CommandBar from "@/components/dashboard/CommandBar";
import { useDashboardTheme, ThemeToggle, DashboardThemeProvider } from "@/lib/dashboard-theme-ctx";
import { useAuth } from "@/lib/auth-ctx";
import { AuroraRing, StatusText } from "@/components/ui/Loader";
import { useFarewell } from "@/lib/farewell-ctx";
import { TABS, type TabId } from "@/lib/data";
import BrandMark from "@/components/ui/BrandMark";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { LogoutFarewellProvider } from "@/lib/farewell-ctx";

// The voice tutor (speech-recognition stack) is only needed when launched —
// keep it out of the critical dashboard bundle.
const VoiceAITutor = dynamic(() => import("@/components/dashboard/VoiceAITutor"), {
  ssr: false,
});

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
          <div className="flex items-center gap-3 text-emerald-400 font-mono text-sm">
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
          <div className="flex items-center gap-3 text-emerald-400 font-mono text-sm">
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
  };

  return (
    <DashboardThemeProvider>
      <LogoutFarewellProvider>
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

            {/* Main Column */}
            <div className="flex-1 min-w-0 flex flex-col h-full">
              {/* Fixed Top Header — academic premium */}
              <header className="shrink-0 z-30 border-b pt-safe backdrop-blur-md" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
                <div className="flex items-center gap-3 px-4 sm:px-6 h-14 lg:h-16">
                  {/* Mobile logo */}
                  <Link
                    href="/"
                    className="lg:hidden flex items-center gap-2.5 font-display font-bold text-[15px]"
                    style={{ color: "var(--dashboard-text-primary)" }}
                    aria-label="9th-grade-ai home"
                  >
                    <BrandMark className="h-8 w-8 rounded-lg shadow-[0_2px_8px_rgba(79,70,229,0.25)] ring-1 ring-black/5" />
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
      </LogoutFarewellProvider>
    </DashboardThemeProvider>
  );
}
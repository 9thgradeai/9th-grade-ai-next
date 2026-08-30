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
import ThemeToggle from "@/components/ThemeToggle";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { LogoutFarewellProvider, useFarewell } from "@/lib/farewell-ctx";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useAuth } from "@/lib/auth-ctx";
import { TABS, type TabId } from "@/lib/data";
import BrandMark from "@/components/ui/BrandMark";

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
        <div className="flex items-center gap-3 text-emerald-400 font-mono text-sm">
          <span className="w-4 h-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" aria-hidden="true" />
          Verifying credentials...
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
        <div className="flex items-center gap-3 text-emerald-400 font-mono text-sm">
          <span className="w-4 h-4 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" aria-hidden="true" />
          Redirecting to email verification...
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeTab, setActiveTab } = useDashboardStore();

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.push(`/dashboard?tab=${tab}`);
  };

  return (
    <LogoutFarewellProvider>
      <EmailVerificationGate>
        <DashboardShell activeTab={activeTab} onTabChange={handleTabChange}>
          {children}
        </DashboardShell>
      </EmailVerificationGate>
    </LogoutFarewellProvider>
  );
}

function DashboardShell({
  children,
  activeTab,
  onTabChange,
}: {
  children: React.ReactNode;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { isLoggingOut } = useFarewell();

  // Redirect to login after render once we know the user isn't authenticated —
  // unless we're deliberately logging out (the farewell owns the navigation).
  useEffect(() => {
    if (!authLoading && !user && !isLoggingOut) {
      router.replace("/login");
    }
  }, [authLoading, user, isLoggingOut, router]);

  if (!user) {
    return null;
  }

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "DASHBOARD";

  return (
    <MotionConfig reducedMotion="user">
      <div className="dashboard-shell h-dvh overflow-hidden flex">
      {/* Skip link — first focusable element for keyboard users */}
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-emerald-500 focus:text-zinc-950 focus:font-mono focus:text-sm"
      >
        Skip to content
      </a>

      {/* Desktop Side Navigation (>=1024px) — locked column, never scrolls away */}
      <SideNav activeTab={activeTab} onChange={onTabChange} />

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col h-full">
        {/* Fixed Top Header (all viewports) */}
        <header className="shrink-0 z-30 glass border-b border-default pt-safe">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14 lg:h-16">
            {/* Mobile logo */}
            <Link
              href="/"
              className="lg:hidden flex items-center gap-2 font-display font-semibold text-white text-base"
              aria-label="9th-grade-ai home"
            >
              <BrandMark className="h-7 w-7 rounded-lg shadow-[0_0_16px_rgba(16,185,129,0.35)]" />
              <span>9th-grade-ai</span>
            </Link>

            {/* Desktop page title */}
            <span className="hidden lg:flex items-center gap-2.5 text-sm font-mono text-zinc-500">
              <span className="text-emerald-500">{"$"}</span>
              <span className="text-white font-semibold tracking-wide">{activeLabel}</span>
            </span>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("app:open-command"))}
                aria-label="কমান্ড প্যানেল খুলুন"
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 text-[11px] font-mono text-zinc-400 hover:text-emerald-300 hover:border-emerald-500/30 transition-colors"
              >
                <span>⌘K</span>
              </button>
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" aria-hidden="true" />
                session
              </span>
              <NotificationCenter />
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Scrollable Content — the only thing that moves */}
        <main id="dashboard-content" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-40 lg:pb-8">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 min-w-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (<1024px) */}
      <BottomNav activeTab={activeTab} onChange={onTabChange} />

      {/* Global Components */}
      <VoiceAITutor />
      <CommandBar />
      </div>
    </MotionConfig>
  );
}
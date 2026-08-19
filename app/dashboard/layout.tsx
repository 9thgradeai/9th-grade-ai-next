/* src/app/dashboard/layout.tsx */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import SideNav from "@/components/dashboard/SideNav";
import BottomNav from "@/components/dashboard/BottomNav";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import VoiceAITutor from "@/components/dashboard/VoiceAITutor";
import ThemeToggle from "@/components/ThemeToggle";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useAuth } from "@/lib/auth-ctx";
import { TABS, type TabId } from "@/lib/data";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { activeTab, setActiveTab } = useDashboardStore();
  const { user, isLoading: authLoading } = useAuth();

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    router.push(`/dashboard?tab=${tab}`);
  };

  // Redirect to login after render once we know the user isn't authenticated.
  // Doing this in an effect avoids calling a navigation side-effect during
  // render (which React warns about and can double-fire).
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
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

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "DASHBOARD";

  return (
    <div className="dashboard-shell min-h-dvh flex">
      {/* Desktop Side Navigation (>=1024px) */}
      <SideNav activeTab={activeTab} onChange={handleTabChange} />

      {/* Main Column */}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col">
        {/* Sticky Top Header (all viewports) */}
        <header className="sticky top-0 z-30 glass border-b border-default pt-safe">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14 lg:h-16">
            {/* Mobile logo */}
            <Link
              href="/"
              className="lg:hidden flex items-center gap-2 font-display font-semibold text-white text-base"
              aria-label="9th-grade-ai home"
            >
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 via-emerald-500 to-cyan-500 shadow-[0_0_16px_rgba(16,185,129,0.35)] flex items-center justify-center text-zinc-950 font-mono font-bold text-sm">
                {"⌁"}
              </span>
              <span>9th-grade-ai</span>
            </Link>

            {/* Desktop page title */}
            <span className="hidden lg:flex items-center gap-2.5 text-sm font-mono text-zinc-500">
              <span className="text-emerald-500">{"$"}</span>
              <span className="text-white font-semibold tracking-wide">{activeLabel}</span>
            </span>

            <div className="ml-auto flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 text-[11px] font-mono uppercase tracking-wider text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" aria-hidden="true" />
                session
              </span>
              <NotificationCenter />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 pb-24 lg:pb-8">
          <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 min-w-0">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation (<1024px) */}
      <BottomNav activeTab={activeTab} onChange={handleTabChange} />

      {/* Global Components */}
      <VoiceAITutor />
    </div>
  );
}

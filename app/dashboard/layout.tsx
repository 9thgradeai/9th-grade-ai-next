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
      <div className="min-h-dvh bg-zinc-950 flex items-center justify-center">
        <div className="text-emerald-500 font-mono text-sm animate-pulse">Verifying credentials...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const activeLabel = TABS.find((t) => t.id === activeTab)?.label ?? "DASHBOARD";

  return (
    <div className="min-h-dvh bg-zinc-950 flex">
      {/* Desktop Side Navigation (>=1024px) */}
      <SideNav activeTab={activeTab} onChange={handleTabChange} />

      {/* Main Column */}
      <div className="flex-1 lg:ml-64 min-w-0 flex flex-col">
        {/* Sticky Top Header (all viewports) */}
        <header className="sticky top-0 z-30 glass border-b border-terminal-border pt-safe">
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14 lg:h-16">
            {/* Mobile logo */}
            <Link
              href="/"
              className="lg:hidden flex items-center gap-2 font-mono font-bold text-white text-base"
              aria-label="9th-grade-ai home"
            >
              <span className="text-emerald-500">&gt;</span>
              <span>9th-grade-ai</span>
            </Link>

            {/* Desktop page title */}
            <span className="hidden lg:flex items-center gap-2 text-sm font-mono text-zinc-400">
              <span className="text-emerald-500">$</span>
              <span className="text-white font-semibold tracking-wide">{activeLabel}</span>
            </span>

            <div className="ml-auto flex items-center gap-1">
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

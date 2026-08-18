/* src/app/dashboard/layout.tsx */
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import SideNav from "@/components/dashboard/SideNav";
import BottomNav from "@/components/dashboard/BottomNav";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import VoiceAITutor from "@/components/dashboard/VoiceAITutor";
import ThemeToggle from "@/components/ThemeToggle";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { useAuth } from "@/lib/auth-ctx";
import type { TabId } from "@/lib/data";

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
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-emerald-500 font-mono text-sm animate-pulse">Verifying credentials...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Desktop Side Navigation */}
      <SideNav activeTab={activeTab} onChange={handleTabChange} />

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pb-20 md:pb-0">
        <div className="max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav activeTab={activeTab} onChange={handleTabChange} />

      {/* Global Components */}
      <NotificationCenter />
      <VoiceAITutor />
      <div className="fixed top-4 right-4 z-30">
        <ThemeToggle />
      </div>
    </div>
  );
}

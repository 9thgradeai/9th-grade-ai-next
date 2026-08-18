/* src/components/dashboard/SideNav.tsx */
"use client";

import { motion } from "framer-motion";
import { TABS, type TabId } from "@/lib/data";
import { Home, Calendar, Zap, Brain, Bot, BookOpen, TrendingUp, HardDrive } from "lucide-react";
import { useAuth } from "@/lib/auth-ctx";

const TAB_ICONS: Record<TabId, typeof Home> = {
  home: Home,
  "study-planner": Calendar,
  practice: Zap,
  flashcards: Brain,
  "ai-solver": Bot,
  "question-bank": BookOpen,
  progress: TrendingUp,
  offline: HardDrive,
};

interface SideNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function SideNav({ activeTab, onChange }: SideNavProps) {
  const { user } = useAuth();
  const displayName = user?.name ?? "Guest";
  const displayInitial = user?.name?.charAt(0) ?? "G";

  return (
    <nav
      className="hidden md:flex flex-col w-64 h-screen sticky top-0 border-r border-terminal-border bg-zinc-950/80 backdrop-blur-xl z-30"
      aria-label="Desktop navigation"
    >
      {/* Logo / Brand */}
      <div className="p-6 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 font-mono text-xl font-bold">{">"}</span>
          <span className="text-white font-mono font-bold tracking-tight">9th-grade-ai</span>
        </div>
        <p className="text-xs text-zinc-500 font-mono mt-1">v0.2.0 // interactive shell</p>
      </div>

      {/* Tab links */}
      <div className="flex-1 py-6 px-3 space-y-1">
        {TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-terminal-rounded text-left transition-all ${
                isActive
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "text-zinc-400 hover:text-white hover:bg-zinc-900/50 border border-transparent"
              }`}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <motion.span
                  layoutId="side-nav-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-500 rounded-r-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
              <div className="flex flex-col">
                <span className="text-sm font-medium">{tab.label}</span>
                <span className="text-[10px] font-mono text-zinc-500">{tab.bengali}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* User mini-profile */}
      <div className="p-4 border-t border-terminal-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-sm font-bold text-emerald-400">
            {displayInitial}
          </div>
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{displayName}</p>
            <p className="text-[10px] text-zinc-500 font-mono truncate">Grade 9 Science</p>
          </div>
        </div>
      </div>
    </nav>
  );
}

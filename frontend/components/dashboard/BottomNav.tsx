"use client";

import { motion } from "framer-motion";
import { TABS, type TabId } from "@/lib/data";
import { Home, Calendar, Zap, Brain, TrendingUp, MoreHorizontal } from "lucide-react";

const BOTTOM_TABS: { id: TabId; icon: typeof Home; short: string }[] = [
  { id: "home", icon: Home, short: "HOM" },
  { id: "study-planner", icon: Calendar, short: "PLN" },
  { id: "practice", icon: Zap, short: "PRC" },
  { id: "flashcards", icon: Brain, short: "FLC" },
  { id: "progress", icon: TrendingUp, short: "PRG" },
];

interface BottomNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const isActive = (id: TabId) => activeTab === id;
  const extraTabs = TABS.filter((t) => !BOTTOM_TABS.find((bt) => bt.id === t.id));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-terminal-border md:hidden"
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch justify-around">
        {BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5"
              aria-label={`${tab.short} tab`}
              aria-current={isActive(tab.id) ? "page" : undefined}
            >
              {isActive(tab.id) && (
                <motion.span
                  layoutId="bottom-nav-active"
                  className="absolute top-0 w-10 h-0.5 bg-emerald-500 rounded-full"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <motion.div
                animate={{ scale: isActive(tab.id) ? 1.1 : 1, y: isActive(tab.id) ? -2 : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className={isActive(tab.id) ? "text-emerald-400" : "text-zinc-500"}
              >
                <Icon className="w-5 h-5" strokeWidth={isActive(tab.id) ? 2.2 : 1.8} />
              </motion.div>
              <span
                className={`text-[10px] font-mono tracking-widest ${
                  isActive(tab.id) ? "text-emerald-400" : "text-zinc-500"
                }`}
              >
                {tab.short}
              </span>
            </button>
          );
        })}
        <button
          onClick={() => {
            const next = extraTabs[0];
            if (next) onChange(next.id);
          }}
          className="relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2.5 text-zinc-500"
          aria-label="More options"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-mono tracking-widest">MORE</span>
        </button>
      </div>
    </nav>
  );
}
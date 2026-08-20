"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import type { ComponentType } from "react";
import { TABS, type TabId } from "@/lib/data";
import { Home, Calendar, Zap, Brain, TrendingUp, MoreHorizontal, X, BookOpen, HardDrive, Settings } from "lucide-react";
import LogoutButton from "./LogoutButton";
import AiLogo from "@/components/ui/AiLogo";

type IconProps = { className?: string; strokeWidth?: number };
const BOTTOM_TABS: { id: TabId; icon: ComponentType<IconProps>; short: string }[] = [
  { id: "home", icon: Home, short: "HOM" },
  { id: "study-planner", icon: Calendar, short: "PLN" },
  { id: "practice", icon: Zap, short: "PRC" },
  { id: "flashcards", icon: Brain, short: "FLC" },
  { id: "progress", icon: TrendingUp, short: "PRG" },
];

const TAB_ICONS: Record<TabId, ComponentType<IconProps>> = {
  home: Home,
  "study-planner": Calendar,
  practice: Zap,
  flashcards: Brain,
  "ai-solver": AiLogo,
  "question-bank": BookOpen,
  progress: TrendingUp,
  offline: HardDrive,
  settings: Settings,
};

interface BottomNavProps {
  activeTab: TabId;
  onChange: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const isActive = (id: TabId) => activeTab === id;
  const extraTabs = TABS.filter((t) => !BOTTOM_TABS.find((bt) => bt.id === t.id));

  const selectTab = (id: TabId) => {
    onChange(id);
    setMoreOpen(false);
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 glass border-t border-terminal-border lg:hidden pb-safe"
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch justify-around">
          {BOTTOM_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                className="relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[56px] py-1.5"
                aria-label={TABS.find((t) => t.id === tab.id)?.label ?? tab.short}
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
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[56px] py-1.5 text-zinc-500"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-[10px] font-mono tracking-widest">MORE</span>
          </button>
        </div>
      </nav>

      {/* More sheet */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="More options"
          >
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
              className="absolute bottom-0 left-0 right-0 rounded-t-2xl border-t border-default bg-[var(--surface-solid)] shadow-2xl pb-safe"
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-white font-mono">আরও অপশন</h2>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-2 text-zinc-400 hover:text-white transition-colors"
                  aria-label="বন্ধ করুন"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 p-4 pt-2">
                {extraTabs.map((tab) => {
                  const Icon = TAB_ICONS[tab.id];
                  const active = isActive(tab.id);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => selectTab(tab.id)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-4 min-h-[72px] transition-all ${
                        active
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "border-default bg-subtle text-zinc-400 hover:border-emerald-500/30 hover:text-white"
                      }`}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-[11px] font-mono leading-tight text-center">
                        {tab.bengali}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-terminal-border mt-3 pt-2 px-4 pb-4">
                <div onClick={() => setMoreOpen(false)}>
                  <LogoutButton aria-label="Log out of your account" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

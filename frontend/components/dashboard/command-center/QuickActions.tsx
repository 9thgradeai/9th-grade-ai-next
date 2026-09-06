"use client";

import { Zap, BookOpen, Target, Brain, Calendar, BarChart3, ClipboardCheck, Sparkles, Command } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { launchAI } from "@/lib/ai-launcher";
import type { TabId } from "@/lib/data";

type Action = {
  keyLabel: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** tab to switch to, or null for special actions */
  tab: TabId | null;
  primary?: boolean;
  mode?: "quick" | "mock";
  /** special action: "ai-tutor" opens the floating AI workspace */
  special?: "ai-tutor";
  badge?: number | string;
};

type Props = {
  pendingMistakes?: number;
  flashcardsDue?: number | null;
  onAction?: (tab: TabId | null, action: Action) => void;
};

export default function QuickActions({ pendingMistakes = 0, flashcardsDue = null, onAction }: Props) {
  const { setActiveTab, setPracticeIntent } = useDashboardStore((s) => ({
    setActiveTab: s.setActiveTab,
    setPracticeIntent: s.setPracticeIntent,
  }));

  const ACTIONS: Action[] = [
    { keyLabel: "P", label: "Practice",   icon: Zap,           tab: "practice",      primary: true, mode: "quick" },
    { keyLabel: "M", label: "Mock Exam",  icon: ClipboardCheck, tab: "practice",     mode: "mock" },
    { keyLabel: "W", label: "Wrong Ans",  icon: Target,         tab: "mistakes",     badge: pendingMistakes > 0 ? pendingMistakes : undefined },
    { keyLabel: "A", label: "AI Tutor",   icon: Sparkles,       tab: null,           special: "ai-tutor" },
    { keyLabel: "L", label: "Planner",    icon: Calendar,       tab: "study-planner" },
    { keyLabel: "Q", label: "Q-Bank",     icon: BookOpen,       tab: "question-bank" },
    { keyLabel: "F", label: "Flashcards", icon: Brain,          tab: "flashcards",   badge: flashcardsDue && flashcardsDue > 0 ? flashcardsDue : undefined },
    { keyLabel: "K", label: "Analytics",  icon: BarChart3,      tab: "progress" },
  ];

  const handle = (a: Action) => {
    if (onAction) {
      onAction(a.tab, a);
      return;
    }
    // AI Tutor: open the floating AI workspace modal via the global launcher event.
    if (a.special === "ai-tutor") {
      launchAI({ mode: "tutor" });
      return;
    }
    // Practice / Mock Exam: set intent so PracticeTab auto-enters the right mode.
    if (a.mode) {
      setPracticeIntent({ mode: a.mode });
    }
    if (a.tab) {
      setActiveTab(a.tab);
    }
  };

  return (
    <div className="command-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="command-eyebrow !text-[10px] flex items-center gap-1.5">
          <Command className="w-3 h-3 text-[var(--dashboard-primary)]" /> HUD Command Dock
        </p>
        <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)] hidden sm:inline-block">
          Press hotkeys <kbd className="px-1.5 py-0.5 rounded border bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-primary)] font-bold">P</kbd> <kbd className="px-1.5 py-0.5 rounded border bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-primary)] font-bold">M</kbd> <kbd className="px-1.5 py-0.5 rounded border bg-[var(--dashboard-surface-muted)] text-[var(--dashboard-primary)] font-bold">A</kbd> for instant navigation
        </span>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => handle(a)}
            aria-label={`${a.label} (Hotkey ${a.keyLabel})`}
            className={`command-dock-btn relative group ${a.primary ? "command-dock-btn--primary" : ""}`}
          >
            {a.badge != null && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[9px] font-mono font-bold rounded-full bg-[var(--dashboard-danger)] text-white shadow-sm z-10">
                {a.badge}
              </span>
            )}
            <a.icon className="w-5 h-5 transition-transform group-hover:scale-110" />
            <span className="truncate w-full text-center">{a.label}</span>
            <span className="text-[9px] font-mono opacity-50 font-semibold group-hover:opacity-100 group-hover:text-[var(--dashboard-primary)] transition-opacity">
              [{a.keyLabel}]
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

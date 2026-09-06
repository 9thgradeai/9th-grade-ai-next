"use client";
import { Zap, BookOpen, Target, Brain, Calendar, BarChart3, ClipboardCheck, Sparkles } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import type { TabId } from "@/lib/data";

type Action = { label: string; icon: React.ComponentType<{ className?: string }>; tab: TabId; primary?: boolean; mode?: "quick"|"mock" };

const ACTIONS: Action[] = [
  { label: "Practice", icon: Zap, tab: "practice", primary: true, mode: "quick" },
  { label: "Mock Exam", icon: ClipboardCheck, tab: "practice", mode: "mock" },
  { label: "Wrong Ans", icon: Target, tab: "mistakes" },
  { label: "AI Tutor", icon: Sparkles, tab: "practice" },
  { label: "Planner", icon: Calendar, tab: "study-planner" },
  { label: "Q-Bank", icon: BookOpen, tab: "question-bank" },
  { label: "Flashcards", icon: Brain, tab: "flashcards" },
  { label: "Analytics", icon: BarChart3, tab: "progress" },
];

export default function QuickActions({ onAction }: { onAction?: (tab: TabId, action: Action) => void }) {
  const { setActiveTab, setPracticeIntent } = useDashboardStore(s => ({ setActiveTab: s.setActiveTab, setPracticeIntent: s.setPracticeIntent }));
  const handle = (a: Action) => {
    if (onAction) { onAction(a.tab, a); return; }
    // Real functional wiring — not showcase
    if (a.label === "AI Tutor") {
      // Prefer scrolling to the live AI coach on the Home tab; if not on Home, open Practice with AI context
      const el = document.getElementById("dashboard-ai-coach");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.dispatchEvent(new CustomEvent("dashboard:quick-ai-tutor"));
      } else {
        setPracticeIntent({ mode: "quick" });
        setActiveTab("practice");
      }
      return;
    }
    if (a.mode) {
      setPracticeIntent({ mode: a.mode });
    }
    setActiveTab(a.tab);
  };
  return (
    <div className="command-card p-4">
      <p className="command-eyebrow !text-[10px]">Quick Actions</p>
      <div className="mt-3 grid grid-cols-4 sm:grid-cols-8 gap-2">
        {ACTIONS.map((a) => (
          <button key={a.label} onClick={() => handle(a)} aria-label={a.label} className={`command-dock-btn ${a.primary ? "command-dock-btn--primary" : ""}`}>
            <a.icon className="w-5 h-5" />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

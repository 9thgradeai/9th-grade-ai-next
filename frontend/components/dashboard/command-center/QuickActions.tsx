"use client";
import { Zap, BookOpen, Target, Brain, Calendar, BarChart3, ClipboardCheck, Sparkles } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import type { TabId } from "@/lib/data";

const ACTIONS: { label: string; icon: React.ComponentType<{ className?: string }>; tab: TabId; primary?: boolean }[] = [
  { label: "Practice", icon: Zap, tab: "practice", primary: true },
  { label: "Mock Exam", icon: ClipboardCheck, tab: "practice" },
  { label: "Wrong Ans", icon: Target, tab: "mistakes" },
  { label: "AI Tutor", icon: Sparkles, tab: "practice" },
  { label: "Planner", icon: Calendar, tab: "study-planner" },
  { label: "Q-Bank", icon: BookOpen, tab: "question-bank" },
  { label: "Flashcards", icon: Brain, tab: "flashcards" },
  { label: "Analytics", icon: BarChart3, tab: "progress" },
];

export default function QuickActions({ onAction }: { onAction?: (tab: TabId) => void }) {
  const { setActiveTab } = useDashboardStore();
  const handle = (tab: TabId) => {
    if (onAction) onAction(tab);
    else setActiveTab(tab);
  };
  return (
    <div className="command-card p-4">
      <p className="command-eyebrow !text-[10px]">Quick Actions</p>
      <div className="mt-3 grid grid-cols-4 sm:grid-cols-8 gap-2">
        {ACTIONS.map((a) => (
          <button key={a.label} onClick={() => handle(a.tab)} aria-label={a.label} className={`command-dock-btn ${a.primary ? "command-dock-btn--primary" : ""}`}>
            <a.icon className="w-5 h-5" />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Zap, BookOpen, Target, Brain, Calendar, BarChart3, ClipboardCheck, Sparkles, Command } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { launchAI } from "@/lib/ai-launcher";
import type { TabId } from "@/lib/data";
import { api } from "@/lib/services/api";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  const router = useRouter();
  const { setActiveTab, setPracticeIntent } = useDashboardStore((s) => ({
    setActiveTab: s.setActiveTab,
    setPracticeIntent: s.setPracticeIntent,
  }));
  const [qbankCount, setQbankCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void api.questionBankCategories().then(cats => { if (!cancelled) setQbankCount(cats.reduce((a,c)=>a+(c.count??0),0)); }).catch(()=>{});
    return () => { cancelled=true; };
  }, []);

  const ACTIONS: Action[] = useMemo(() => [
    { keyLabel: "P", label: t("dock.practice"),   icon: Zap,           tab: "practice",      primary: true, mode: "quick" },
    { keyLabel: "M", label: t("dock.mockExam"),  icon: ClipboardCheck, tab: "practice",     mode: "mock" },
    { keyLabel: "W", label: t("dock.wrongAns"),  icon: Target,         tab: "mistakes",     badge: pendingMistakes > 0 ? pendingMistakes : undefined },
    { keyLabel: "A", label: t("dock.aiTutor"),   icon: Sparkles,       tab: null,           special: "ai-tutor" },
    { keyLabel: "L", label: t("dock.planner"),    icon: Calendar,       tab: "study-planner" },
    { keyLabel: "Q", label: t("dock.qbank"),     icon: BookOpen,       tab: "question-bank", badge: qbankCount && qbankCount>0 ? (qbankCount>999?"999+":String(qbankCount)) : undefined },
    { keyLabel: "F", label: t("dock.flashcards"), icon: Brain,          tab: "flashcards",   badge: flashcardsDue && flashcardsDue > 0 ? flashcardsDue : undefined },
    { keyLabel: "K", label: t("dock.analytics"),  icon: BarChart3,      tab: "progress" },
  ], [t, pendingMistakes, flashcardsDue, qbankCount]);

  const navigate = useCallback((tab: TabId) => {
    setActiveTab(tab);
    router.push(`/dashboard?tab=${tab}`);
  }, [setActiveTab, router]);

  const handle = useCallback((a: Action) => {
    if (onAction) {
      onAction(a.tab, a);
      return;
    }
    if (a.special === "ai-tutor") {
      launchAI({ mode: "tutor" });
      return;
    }
    if (a.mode) {
      setPracticeIntent({ mode: a.mode });
    } else {
      setPracticeIntent(null);
    }
    if (a.tab) {
      navigate(a.tab);
    }
  }, [onAction, navigate, setPracticeIntent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable) return;
      const key = e.key.toUpperCase();
      const hit = ACTIONS.find(ax => ax.keyLabel === key);
      if (!hit) return;
      e.preventDefault();
      handle(hit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ACTIONS, handle]);

  return (
    <div className="command-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="command-eyebrow !text-[10px] flex items-center gap-1.5">
          <Command className="w-3 h-3 text-[var(--dashboard-primary)]" /> {t("dock.title")}
        </p>
        <span className="text-[10px] font-mono text-[var(--dashboard-text-muted)] hidden sm:inline-block">
          {t("dock.hotkeys")}
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

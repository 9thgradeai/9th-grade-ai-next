"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LightningA, BookOpen, Target, Brain, Calendar, ChartBar, CheckSquare, Command } from "@phosphor-icons/react";
import AiLogo from "@/components/ui/AiLogo";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { launchAI } from "@/lib/ai-launcher";
import type { TabId } from "@/lib/data";
import { api } from "@/lib/services/api";
import { useT } from "@/lib/i18n";

type Action = {
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

// Bespoke 9Th-Grade AI emblem as a dock glyph — inherits the button colour.
const AiGlyph = ({ className }: { className?: string }) => <AiLogo solid={false} className={className} />;

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
    { label: t("dock.practice"),   icon: LightningA,           tab: "practice",      primary: true, mode: "quick" },
    { label: t("dock.mockExam"),  icon: CheckSquare, tab: "practice",     mode: "mock" },
    { label: t("dock.wrongAns"),  icon: Target,         tab: "mistakes",     badge: pendingMistakes > 0 ? pendingMistakes : undefined },
    { label: t("dock.aiTutor"),   icon: AiGlyph,       tab: null,           special: "ai-tutor" },
    { label: t("dock.planner"),    icon: Calendar,       tab: "study-planner" },
    { label: t("dock.qbank"),     icon: BookOpen,       tab: "question-bank", badge: qbankCount && qbankCount>0 ? (qbankCount>999?"999+":String(qbankCount)) : undefined },
    { label: t("dock.flashcards"), icon: Brain,          tab: "flashcards",   badge: flashcardsDue && flashcardsDue > 0 ? flashcardsDue : undefined },
    { label: t("dock.analytics"),  icon: ChartBar,      tab: "progress" },
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

  // Phase 5: no global letter bindings. This dock duplicated HomeTab's
  // P/M/W/A/L/Q/F/K hijacks (one press fired two handlers). Keyboard users
  // navigate via ⌘K / 1–0 / ? (see ShortcutList).
  return (
    <div className="command-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="command-eyebrow !text-[10px] flex items-center gap-1.5">
          <Command className="w-3 h-3 text-[var(--dashboard-primary)]" /> {t("dock.title")}
        </p>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => handle(a)}
            aria-label={a.label}
            className={`command-dock-btn relative ${a.primary ? "command-dock-btn--primary" : ""}`}
          >
            {a.badge != null && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] text-[9px] font-mono font-bold rounded-full bg-[var(--dashboard-danger)] text-white shadow-sm z-10">
                {a.badge}
              </span>
            )}
            <a.icon className="w-5 h-5" />
            <span className="truncate w-full text-center">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* src/app/dashboard/page.tsx */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { TABS, type TabId } from "@/lib/data";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { AuroraRing } from "@/components/ui/Loader";

// Shown while a lazily-imported tab chunk streams in — never a blank pane.
function TabChunkLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Tab loading">
      <span className="sr-only">লোড হচ্ছে…</span>
      <div className="glass-card rounded-2xl border p-6 flex flex-col items-center justify-center gap-3 text-center" style={{ borderColor: "var(--dashboard-border-muted)" }}>
        <AuroraRing size={56} label="Tab loading" />
        <p className="font-mono text-[11px] tracking-[0.3em] uppercase" style={{ color: "var(--dashboard-primary)" }}>
          Loading module
        </p>
      </div>
      <SkeletonCard className="p-6">
        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-[88%]" />
            <Skeleton className="h-4 w-[76%]" />
            <Skeleton className="h-4 w-[64%]" />
          </div>
        </div>
      </SkeletonCard>
      <SkeletonCard>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="hidden sm:block h-16 rounded-xl" />
        </div>
      </SkeletonCard>
    </div>
  );
}

// Tabs are code-split so the initial dashboard bundle only pays for the
// active tab (CustomExamTab/VoiceAITutor alone account for ~1,800 LOC).
const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  home: dynamic(() => import("@/components/dashboard/HomeTab"), { loading: TabChunkLoading }),
  "study-planner": dynamic(() => import("@/components/dashboard/StudyPlannerTab"), { loading: TabChunkLoading }),
  practice: dynamic(() => import("@/components/dashboard/PracticeTab"), { loading: TabChunkLoading }),
  flashcards: dynamic(() => import("@/components/dashboard/FlashcardsTab"), { loading: TabChunkLoading }),
  "ai-solver": dynamic(() => import("@/components/dashboard/AISolverTab"), { loading: TabChunkLoading }),
  "ai-evaluate": dynamic(() => import("@/components/dashboard/AnswerEvaluatorTab"), { loading: TabChunkLoading }),
  "ai-mock-test": dynamic(() => import("@/components/dashboard/AIMockTestTab"), { loading: TabChunkLoading }),
  "ai-voice": dynamic(() => import("@/components/dashboard/VoiceInterviewTab"), { loading: TabChunkLoading }),
  "ai-advisor": dynamic(() => import("@/components/dashboard/AdvisorTab"), { loading: TabChunkLoading }),
  "ai-model": dynamic(() => import("@/components/dashboard/StudentModelTab"), { loading: TabChunkLoading }),
  "ai-usage": dynamic(() => import("@/components/dashboard/UsageTab"), { loading: TabChunkLoading }),
  "question-bank": dynamic(() => import("@/components/dashboard/QuestionBankTab"), { loading: TabChunkLoading }),
  progress: dynamic(() => import("@/components/dashboard/ProgressTab"), { loading: TabChunkLoading }),
  "wrong-answers": dynamic(() => import("@/components/dashboard/WrongAnswerNotebookTab"), { loading: TabChunkLoading }),
  mistakes: dynamic(() => import("@/components/dashboard/MistakesTab"), { loading: TabChunkLoading }),
  settings: dynamic(() => import("@/components/dashboard/SettingsTab"), { loading: TabChunkLoading }),
};

function TabSwitcher() {
  const searchParams = useSearchParams();
  const { activeTab, setActiveTab } = useDashboardStore();
  const shouldReduceMotion = useReducedMotion();

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  const tab = searchParams.get("tab") as TabId | null;
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab) && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [tab, activeTab, setActiveTab]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -12 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
        className="flex flex-1 flex-col"
      >
        <ActiveComponent />
      </motion.div>
    </AnimatePresence>
  );
}

export default function DashboardPage() {
  // useSearchParams requires a Suspense boundary for static prerendering.
  return (
    <Suspense fallback={<div className="flex-1 min-h-[40vh]" aria-hidden="true" />}>
      <TabSwitcher />
    </Suspense>
  );
}

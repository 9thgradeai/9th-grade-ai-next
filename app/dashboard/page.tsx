/* src/app/dashboard/page.tsx */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { TABS, type TabId } from "@/lib/data";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { LoadingShell } from "@/components/ui/LoadingShell";
import { useT } from "@/lib/i18n";

// Shown while a lazily-imported tab chunk streams in — never a blank pane.
function TabChunkLoading() {
  const t = useT();
  return (
    <div className="space-y-4" role="status" aria-label={t("dashboard.loadingModule")}>
      <span className="sr-only">{t("common.loading")}</span>
      <LoadingShell title={t("dashboard.loadingModule")} progressLabel={t("dashboard.loadingModule")} />

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
  "question-bank": dynamic(() => import("@/components/dashboard/QuestionBankTab"), { loading: TabChunkLoading }),
  progress: dynamic(() => import("@/components/dashboard/ProgressTab"), { loading: TabChunkLoading }),
  mistakes: dynamic(() => import("@/components/dashboard/WrongAnswerNotebookTab"), { loading: TabChunkLoading }),
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

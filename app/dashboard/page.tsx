/* src/app/dashboard/page.tsx */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { api } from "@/lib/services/api";
import { TABS, type TabId } from "@/lib/data";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
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
  "exam-history": dynamic(() => import("@/components/dashboard/ExamHistoryTab"), { loading: TabChunkLoading }),
  "real-exam": dynamic(() => import("@/components/dashboard/RealExamTab"), { loading: TabChunkLoading }),
  vocab: dynamic(() => import("@/components/dashboard/VocabTab"), { loading: TabChunkLoading }),
};

function TabSwitcher() {
  const searchParams = useSearchParams();
  const { activeTab, setActiveTab, setPracticeIntent, setQuestionBankFilters } = useDashboardStore();
  const shouldReduceMotion = useReducedMotion();

  const ActiveComponent = TAB_COMPONENTS[activeTab];

  // Phase 4: warm the cheap pulse scope the moment the dashboard shell mounts
  // (right after login). By the time the Home chunk streams in, the 15s read
  // cache usually serves pulse instantly — header paints with zero network.
  useEffect(() => {
    void api.preparationIntelligenceScope("pulse").catch(() => undefined);
  }, []);

  const tab = searchParams.get("tab") as TabId | null;
  const mode = searchParams.get("mode");
  const view = searchParams.get("view");
  // URL is the source of truth: any valid ?tab= wins over store state,
  // including on first load (fixes stale-localStorage-wins deep-link bug).
  useEffect(() => {
    if (tab && TABS.some((t) => t.id === tab) && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [tab, activeTab, setActiveTab]);
  // Distinct nav hrefs carry intent: ?mode= selects the practice mode,
  // ?view=bookmarks lands on the saved-questions view (not the generic bank).
  useEffect(() => {
    if (tab === "practice" && (mode === "quick" || mode === "mock" || mode === "custom")) {
      setPracticeIntent({ mode });
    } else if (tab === "question-bank" && view === "bookmarks") {
      setQuestionBankFilters({ query: "", category: "__saved__" });
    }
  }, [tab, mode, view, setPracticeIntent, setQuestionBankFilters]);

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
        <ErrorBoundary
          key={`eb-${activeTab}`}
          fallback={(_error, reset) => (
            <div className="glass-card rounded-2xl border border-red-500/20 p-8 text-center" role="alert">
              <p className="font-mono text-sm text-[var(--dashboard-danger)]">এই ট্যাব লোড করতে সমস্যা হয়েছে।</p>
              <button onClick={reset} className="mt-3 px-4 py-2 min-h-[44px] rounded-lg border border-[var(--dashboard-border-muted)] font-mono text-sm">
                আবার চেষ্টা করুন
              </button>
            </div>
          )}
        >
          <ActiveComponent />
        </ErrorBoundary>
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

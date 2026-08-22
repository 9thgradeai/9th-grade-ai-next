/* src/app/dashboard/page.tsx */
"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { TABS, type TabId } from "@/lib/data";

// Tabs are code-split so the initial dashboard bundle only pays for the
// active tab (CustomExamTab/VoiceAITutor alone account for ~1,800 LOC).
const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  home: dynamic(() => import("@/components/dashboard/HomeTab")),
  "study-planner": dynamic(() => import("@/components/dashboard/StudyPlannerTab")),
  practice: dynamic(() => import("@/components/dashboard/PracticeTab")),
  flashcards: dynamic(() => import("@/components/dashboard/FlashcardsTab")),
  "ai-solver": dynamic(() => import("@/components/dashboard/AISolverTab")),
  "question-bank": dynamic(() => import("@/components/dashboard/QuestionBankTab")),
  progress: dynamic(() => import("@/components/dashboard/ProgressTab")),
  offline: dynamic(() => import("@/components/dashboard/OfflineModeTab")),
  settings: dynamic(() => import("@/components/dashboard/SettingsTab")),
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

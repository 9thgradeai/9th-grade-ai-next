/* src/app/dashboard/page.tsx */
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";
import { TABS, type TabId } from "@/lib/data";
import HomeTab from "@/components/dashboard/HomeTab";
import StudyPlannerTab from "@/components/dashboard/StudyPlannerTab";
import PracticeTab from "@/components/dashboard/PracticeTab";
import FlashcardsTab from "@/components/dashboard/FlashcardsTab";
import AISolverTab from "@/components/dashboard/AISolverTab";
import QuestionBankTab from "@/components/dashboard/QuestionBankTab";
import ProgressTab from "@/components/dashboard/ProgressTab";
import OfflineModeTab from "@/components/dashboard/OfflineModeTab";

const TAB_COMPONENTS: Record<TabId, React.ComponentType> = {
  home: HomeTab,
  "study-planner": StudyPlannerTab,
  practice: PracticeTab,
  flashcards: FlashcardsTab,
  "ai-solver": AISolverTab,
  "question-bank": QuestionBankTab,
  progress: ProgressTab,
  offline: OfflineModeTab,
};

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const { activeTab, setActiveTab } = useDashboardStore();
  const shouldReduceMotion = useReducedMotion();

  const ActiveComponent = TAB_COMPONENTS[activeTab] || HomeTab;

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

import { Home, Calendar, Zap, Brain, BookOpen, TrendingUp, Settings, Target, History, FileDown } from "lucide-react";
import type { ComponentType } from "react";
import type { TabId } from "@/lib/data";

export type IconProps = { className?: string; strokeWidth?: number; style?: React.CSSProperties };

/** Single source of truth for tab icons (SideNav + BottomNav). */
export const TAB_ICONS: Record<TabId, ComponentType<IconProps>> = {
  home: Home,
  "study-planner": Calendar,
  practice: Zap,
  flashcards: Brain,
  "question-bank": BookOpen,
  progress: TrendingUp,
  mistakes: Target,
  settings: Settings,
  "exam-history": History,
  "real-exam": FileDown,
};

/** Bangla labels for question difficulty tiers. */
export const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

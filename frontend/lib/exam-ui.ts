import { Home, Calendar, Zap, Brain, BookOpen, TrendingUp, Settings } from "lucide-react";
import type { ComponentType } from "react";
import type { TabId } from "@/lib/data";
import AiLogo from "@/components/ui/AiLogo";

export type IconProps = { className?: string; strokeWidth?: number };

/** Single source of truth for tab icons (SideNav + BottomNav). */
export const TAB_ICONS: Record<TabId, ComponentType<IconProps>> = {
  home: Home,
  "study-planner": Calendar,
  practice: Zap,
  flashcards: Brain,
  "ai-solver": AiLogo,
  "question-bank": BookOpen,
  progress: TrendingUp,
  settings: Settings,
};

/** Bangla labels for question difficulty tiers. */
export const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

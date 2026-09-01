import { Home, Calendar, Zap, Brain, BookOpen, TrendingUp, Settings, BookX, CheckCircle2, ClipboardList, Mic, Compass, Gauge, Activity, Target } from "lucide-react";
import type { ComponentType } from "react";
import type { TabId } from "@/lib/data";
import AiLogo from "@/components/ui/AiLogo";

export type IconProps = { className?: string; strokeWidth?: number; style?: React.CSSProperties };

/** Single source of truth for tab icons (SideNav + BottomNav). */
export const TAB_ICONS: Record<TabId, ComponentType<IconProps>> = {
  home: Home,
  "study-planner": Calendar,
  practice: Zap,
  flashcards: Brain,
  "ai-solver": AiLogo,
  "ai-evaluate": CheckCircle2,
  "ai-mock-test": ClipboardList,
  "ai-voice": Mic,
  "ai-advisor": Compass,
  "ai-model": Gauge,
  "ai-usage": Activity,
  "question-bank": BookOpen,
  progress: TrendingUp,
  "wrong-answers": BookX,
  mistakes: Target,
  settings: Settings,
};

/** Bangla labels for question difficulty tiers. */
export const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

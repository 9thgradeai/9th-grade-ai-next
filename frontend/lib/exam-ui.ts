"use client";

import { House, Calendar, LightningA, Brain, BookOpen, TrendUp, Gear, Target, ClockCounterClockwise, Download, Newspaper, Sparkle, Robot, Compass, Checks, Microphone, User, ChartBar } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { TabId } from "@/lib/data";

export type IconProps = { className?: string; strokeWidth?: number; style?: React.CSSProperties };

/** Single source of truth for tab icons (SideNav + BottomNav). Phosphor icons per ui-ux-pro-max. */
export const TAB_ICONS: Record<TabId, ComponentType<IconProps>> = {
  home: House,
  "study-planner": Calendar,
  practice: LightningA,
  flashcards: Brain,
  "question-bank": BookOpen,
  progress: TrendUp,
  mistakes: Target,
  settings: Gear,
  "exam-history": ClockCounterClockwise,
  "real-exam": Download,
  vocab: BookOpen,
  "current-affairs": Newspaper,
  "ai-solver": Robot,
  "ai-mock": Sparkle,
  advisor: Compass,
  evaluator: Checks,
  "voice-interview": Microphone,
  "student-model": User,
  usage: ChartBar,
};

/** Bangla labels for question difficulty tiers. */
export const DIFFICULTY_LABEL: Record<string, string> = {
  EASY: "সহজ",
  MEDIUM: "মাঝারি",
  HARD: "কঠিন",
};

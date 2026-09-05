"use client";

// Capability metadata for the AI workspace. Each mode is a genuine, distinct
// backend surface (tutor / assistant / agent) — descriptions stay honest about
// what the model can actually do for the learner.

import { GraduationCap, BrainCircuit, Target, type LucideIcon } from "lucide-react";

export type Mode = "tutor" | "assistant" | "agent";

export type ModeMeta = {
  id: Mode;
  labelBn: string;
  labelEn: string;
  /** Short, honest capability line shown during discovery. */
  descBn: string;
  icon: LucideIcon;
};

export const MODES: ModeMeta[] = [
  {
    id: "tutor",
    labelBn: "টিউটর",
    labelEn: "Tutor",
    descBn: "যেকোনো বিষয় বা ধারণা ধাপে ধাপে বুঝিয়ে শেখায় — প্রশ্ন করলে উত্তর দেয়।",
    icon: GraduationCap,
  },
  {
    id: "assistant",
    labelBn: "সহায়ক",
    labelEn: "Assistant",
    descBn: "আপনার অগ্রগতি, দুর্বলতা ও পড়ার পরিকল্পনা বিশ্লেষণ করে পরামর্শ দেয়।",
    icon: BrainCircuit,
  },
  {
    id: "agent",
    labelBn: "কোচ",
    labelEn: "Coach",
    descBn: "আপনার পরীক্ষার ডেটা বিশ্লেষণ করে প্র্যাক্টিস, রিভিশন ও মক পরীক্ষার কাঠামোবদ্ধ পরামর্শ দেয়।",
    icon: Target,
  },
];

export function modeMeta(mode: Mode): ModeMeta {
  return MODES.find((m) => m.id === mode) ?? MODES[0];
}
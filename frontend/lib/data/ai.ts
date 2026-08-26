// src/lib/ai-data.ts
// Static data backing the AI Tutor and flash-news modal.

import type { PresetPrompt } from "@/lib/types";

// ---------------------------------------------------------------- 1️⃣ AI Tutor: preset quick prompts
export const PRESET_PROMPTS: PresetPrompt[] = [
  {
    id: "physics-formulas",
    label: {
      bn: "৯ম শ্রেণীর পদার্থবিজ্ঞানের গতি সূত্রগুলো ব্যাখ্যা করো",
      en: "Explain the formula of motion for class 9 physics",
    },
  },
  {
    id: "math-shortcuts",
    label: {
      bn: "উচ্চতর গণিতের ত্রিকোণমিতির শর্টকাট সূত্র দাও",
      en: "Give me the shortcut formulas for trigonometry in Higher Math",
    },
  },
  {
    id: "chemistry-table",
    label: {
      bn: "রসায়নের পর্যায় সারণি মনে রাখার সহজ উপায়",
      en: "Easy trick to remember the periodic table",
    },
  },
];

// ---------------------------------------------------------------- 2️⃣ Flash News
// Flash news is editorially curated from verified official sources only (e.g.
// BPSC circulars, government press releases). No placeholder or fabricated
// items are shipped in code — the dashboard hides the section when there is
// nothing verified to show, rather than inventing announcements.
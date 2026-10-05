/**
 * Phase 2 — One AI orchestrator. Single source of truth for every AI entry
 * point (Solver / Tutor-Socratic / Mock / Voice / Coach).
 * Backend surfaces stay in `app/api/ai/*`; this file only routes + discloses.
 */

export type OrchestratorMode = "solve" | "tutor" | "mock" | "voice" | "coach";

export type OrchestratorMeta = {
  id: OrchestratorMode;
  labelBn: string;
  labelEn: string;
  descBn: string;
  endpoint: string;
  socratic: boolean;
  voice: boolean;
};

export const ORCHESTRATOR_MODES: OrchestratorMeta[] = [
  {
    id: "solve",
    labelBn: "সলভার",
    labelEn: "Solver",
    descBn: "ছবি বা প্রশ্ন দিলে ধাপে ধাপে সমাধান দেয়।",
    endpoint: "/api/ai/solver",
    socratic: false,
    voice: false,
  },
  {
    id: "tutor",
    labelBn: "টিউটর",
    labelEn: "Tutor",
    descBn: "উত্তর না দিয়ে প্রশ্ন করে শেখায় — Socratic পদ্ধতি।",
    endpoint: "/api/ai/tutor",
    socratic: true,
    voice: false,
  },
  {
    id: "mock",
    labelBn: "মক টেস্ট",
    labelEn: "Mock",
    descBn: "দুর্বলতা ধরে মক সেট বানায় ও মূল্যায়ন করে।",
    endpoint: "/api/ai/mock-test",
    socratic: false,
    voice: false,
  },
  {
    id: "voice",
    labelBn: "ভয়েস",
    labelEn: "Voice",
    descBn: "মুখে জিজ্ঞেস করুন, শুনে শুনে শিখুন।",
    endpoint: "/api/ai/tutor",
    socratic: true,
    voice: true,
  },
  {
    id: "coach",
    labelBn: "কোচ",
    labelEn: "Coach",
    descBn: "ডেটা দেখে প্ল্যান, রিভিশন ও মক কৌশল দেয়।",
    endpoint: "/api/ai/agent",
    socratic: false,
    voice: false,
  },
];

export function orchestratorMeta(mode: OrchestratorMode): OrchestratorMeta {
  return ORCHESTRATOR_MODES.find((m) => m.id === mode) ?? ORCHESTRATOR_MODES[1];
}

/** Legacy 3-mode ids still sent by old callers → orchestrator ids. */
export function normalizeLegacyMode(mode: string): OrchestratorMode {
  if (mode === "assistant") return "coach";
  if (mode === "agent") return "coach";
  if ((ORCHESTRATOR_MODES as { id: string }[]).some((m) => m.id === mode)) {
    return mode as OrchestratorMode;
  }
  return "tutor";
}

/** Ghost-text / Cmd-K starter prompts per mode (Tab-to-accept UX). */
export function ghostPrompt(mode: OrchestratorMode): string {
  switch (mode) {
    case "solve":
      return "এই প্রশ্নটি ধাপে ধাপে সমাধান করো…";
    case "mock":
      return "আমার দুর্বল টপিক থেকে ৫টি MCQ বানাও…";
    case "voice":
      return "বলো — আজ কী পড়বো?";
    case "coach":
      return "আমার ডেটা দেখে আজকের প্ল্যান দাও…";
    default:
      return "এই ধারণাটি উদাহরণ দিয়ে বুঝিয়ে দাও…";
  }
}

export type SelectionAction = "explain" | "quiz-me" | "simplify";

export function selectionPrompt(action: SelectionAction, selection: string): string {
  const text = selection.slice(0, 500);
  switch (action) {
    case "quiz-me":
      return `নিচের অংশ থেকে ৩টি MCQ বানাও এবং উত্তর শেষে দাও:\n\n${text}`;
    case "simplify":
      return `নিচের অংশটি সহজ বাংলায় বুঝিয়ে দাও:\n\n${text}`;
    default:
      return `নিচের অংশটি ধাপে ধাপে ব্যাখ্যা করো (উত্তর সরাসরি না দিয়ে আগে ইঙ্গিত দাও):\n\n${text}`;
  }
}

/** Mock disclosure — every AI surface must render `source: mock|live`. */
export function isMockProvider(provider?: string | null): boolean {
  return provider === "mock";
}

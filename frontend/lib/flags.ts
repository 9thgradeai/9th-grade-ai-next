// frontend/lib/flags.ts — client-safe feature flags.
//
// Adaptive Exam V2 is enabled by default (the standalone tab is the intended
// product surface). Set NEXT_PUBLIC_ADAPTIVE_EXAM_V2=false to hide the tab and
// disable the entry points during an incident rollout. This flag only controls
// navigation/UI; API routes remain independently authoritative.

export const ADAPTIVE_EXAM_V2_FLAG = "NEXT_PUBLIC_ADAPTIVE_EXAM_V2" as const;

export function isAdaptiveExamV2Enabled(): boolean {
  // eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
  if (typeof process === "undefined") return true;
  // eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
  return process.env[ADAPTIVE_EXAM_V2_FLAG] !== "false";
}

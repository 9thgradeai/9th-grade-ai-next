"use client";

// Capability metadata for the AI workspace — now driven by the single
// Phase-2 orchestrator (`frontend/lib/ai-orchestrator.ts`). Each mode is a
// genuine, distinct backend surface; descriptions stay honest.

import { GraduationCap, Brain, Target, LightningA, Microphone, ClipboardText } from "@phosphor-icons/react";
import { ORCHESTRATOR_MODES, type OrchestratorMode } from "@/lib/ai-orchestrator";

export type Mode = OrchestratorMode;

export type ModeMeta = {
  id: Mode;
  labelBn: string;
  labelEn: string;
  /** Short, honest capability line shown during discovery. */
  descBn: string;
  icon: React.ComponentType<{ className?: string }>;
};

const ICONS: Record<Mode, ModeMeta["icon"]> = {
  solve: LightningA,
  tutor: GraduationCap,
  mock: ClipboardText,
  voice: Microphone,
  coach: Target,
};

/** Back-compat alias: old "assistant"/"agent" ids resolve to coach. */
export const LEGACY_MODE_ALIAS: Record<string, Mode> = {
  assistant: "coach",
  agent: "coach",
};

export const MODES: ModeMeta[] = ORCHESTRATOR_MODES.map((m) => ({
  id: m.id,
  labelBn: m.labelBn,
  labelEn: m.labelEn,
  descBn: m.descBn,
  icon: ICONS[m.id] ?? Brain,
}));

export function modeMeta(mode: Mode): ModeMeta {
  return MODES.find((m) => m.id === mode) ?? MODES[1];
}

"use client";

// Shared state shapes for the AI workspace. All turn branches (tutor,
// assistant, coach) converge on the same UIMessage row model so the thread can
// render uniformly. `Mode`/`Status` are also used by the header chip and the
// composer.

import type { SuggestedActionDto } from "@/lib/services/ai/types";
import type { AgentBlockDto } from "@/lib/types";
import type { Mode } from "./modes";

export type { Mode };

export type Status = "idle" | "generating" | "listening" | "error" | "stopped";

export type UIMessage = {
  id: string;
  role: "user" | "ai";
  text: string;
  messageId?: string;
  actions?: SuggestedActionDto[];
  blocks?: AgentBlockDto[];
  error?: boolean;
};

export const STATUS_LABEL: Record<Status, string> = {
  idle: "READY",
  generating: "GENERATING",
  listening: "LISTENING",
  error: "ERROR",
  stopped: "STOPPED",
};

export type WorkspaceMeta = {
  provider?: string;
  model?: string;
} | null;

// Minimal typings for the vendor-prefixed Web Speech API.
export type SpeechRecognitionResultLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
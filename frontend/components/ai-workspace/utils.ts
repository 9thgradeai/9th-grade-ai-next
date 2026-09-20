// frontend/components/ai-workspace/utils.ts
// Pure utility functions for AIWorkspace (no React dependencies)

import type { AIMessageDto } from "@/lib/services/ai/types";
import type { AgentBlockDto } from "@/lib/types";
import { AGENT_FOLLOWUPS } from "./prompts";
import { type AgentActivityStepDto, type Mode, type Status, type UIMessage } from "./types";

export function messageToUI(m: AIMessageDto): UIMessage {
  const meta = m.metadata;
  const isAgent = meta?.kind === "agent";
  const blocks =
    isAgent && Array.isArray(meta.blocks) ? (meta.blocks as AgentBlockDto[]) : undefined;
  const tools =
    isAgent && Array.isArray(meta.tools) ? (meta.tools as AgentActivityStepDto[]) : undefined;
  return {
    id: m.id,
    role: m.role === "USER" ? "user" : "ai",
    text:
      m.role === "ASSISTANT" && (m.status === "FAILED" || !m.content)
        ? "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না।"
        : m.content,
    messageId: m.role === "ASSISTANT" ? m.id : undefined,
    blocks,
    tools,
    actions: isAgent ? [...AGENT_FOLLOWUPS] : undefined,
    error: m.status === "FAILED",
  };
}

export function detectSpeechLang(text: string): string {
  return /[ঀ-৿]/.test(text) ? "bn-BD" : "en-US";
}

export function statusVariant(status: Status): string {
  switch (status) {
    case "listening":
      return "is-listening";
    case "generating":
      return "is-working";
    case "error":
      return "is-error";
    default:
      return "is-ready";
  }
}

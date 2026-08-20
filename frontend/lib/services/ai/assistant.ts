"use client";

import { aiJson } from "./client";
import type { AIIntent } from "./types";
import type { AssistantResultDto } from "./types";

export type AssistantTurnOptions = {
  conversationId?: string;
  content: string;
  questionId?: number;
  intent?: AIIntent;
};

/** Ask the learning assistant; returns reply + suggested actions. */
export async function askAssistant(
  opts: AssistantTurnOptions,
): Promise<AssistantResultDto> {
  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: opts.content }],
  };
  if (opts.conversationId) body.conversationId = opts.conversationId;
  if (opts.questionId) body.questionId = opts.questionId;
  if (opts.intent) body.intent = opts.intent;

  return aiJson<AssistantResultDto>("/api/ai/assistant", "POST", body);
}
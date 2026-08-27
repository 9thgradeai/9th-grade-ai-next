"use client";

import { streamChat, parseStreamedJson } from "./client";
import type { AIIntent } from "./types";
import type { AssistantResultDto } from "./types";

export type AssistantTurnOptions = {
  conversationId?: string;
  content: string;
  questionId?: number;
  intent?: AIIntent;
};

/** Ask the learning assistant; streams the reply + suggested actions. */
export async function askAssistant(
  opts: AssistantTurnOptions,
): Promise<AssistantResultDto> {
  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: opts.content }],
  };
  if (opts.conversationId) body.conversationId = opts.conversationId;
  if (opts.questionId) body.questionId = opts.questionId;
  if (opts.intent) body.intent = opts.intent;

  let full = "";
  await streamChat({ url: "/api/ai/assistant", body, onChunk: (c) => { full += c; } });
  const parsed = parseStreamedJson(full);
  return (
    (parsed as AssistantResultDto) ?? {
      reply: "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      suggestedActions: [],
      source: "mock",
    }
  );
}

"use client";

import { streamChat, parseStreamedJson } from "./client";
import type { AIIntent, SuggestedActionDto } from "./types";
import type { AssistantResultDto } from "./types";

export type AssistantTurnOptions = {
  conversationId?: string;
  content: string;
  questionId?: number;
  intent?: AIIntent;
};

function toActions(raw: unknown): SuggestedActionDto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      id: typeof a.id === "string" ? a.id : "action",
      labelBn: typeof a.labelBn === "string" ? a.labelBn.slice(0, 60) : "Action",
      labelEn: typeof a.labelEn === "string" ? a.labelEn.slice(0, 60) : "Action",
      action: typeof a.action === "string" ? a.action : "general",
    }))
    .slice(0, 4);
}

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
  const meta = await streamChat({
    url: "/api/ai/assistant",
    body,
    onChunk: (c) => {
      full += c;
    },
  });

  // The assistant endpoint streams a compact JSON envelope. The model may
  // emit the actions under `actions` or `suggestedActions`, and the mock
  // fallback streams plain text — normalize all of it into the stable DTO.
  const parsed = parseStreamedJson(full) as
    | { reply?: unknown; actions?: unknown; suggestedActions?: unknown }
    | null;
  const reply =
    parsed && typeof parsed.reply === "string" && parsed.reply.trim()
      ? parsed.reply.trim()
      : full.trim();
  const suggestedActions = toActions(
    (parsed && Array.isArray(parsed.actions)
      ? parsed.actions
      : parsed && Array.isArray(parsed.suggestedActions)
        ? parsed.suggestedActions
        : []),
  );

  return {
    reply: reply || "দুঃখিত, এখন উত্তর তৈরি করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।",
    suggestedActions,
    source: meta.source || "mock",
    conversationId: meta.conversationId,
  };
}
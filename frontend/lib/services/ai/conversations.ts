"use client";

import { aiJson } from "./client";
import type {
  AIConversationKind,
  AIConversationSummary,
  AIMessageDto,
} from "./types";

export async function listConversations(
  kind?: AIConversationKind,
): Promise<AIConversationSummary[]> {
  const qs = kind ? `?kind=${kind}` : "";
  const data = await aiJson<{ conversations: AIConversationSummary[] }>(
    `/api/ai/conversations${qs}`,
    "GET",
  );
  return data.conversations;
}

export async function createConversation(
  kind: AIConversationKind,
  opts?: { title?: string; subjectId?: number; topicId?: number; topicPath?: string },
): Promise<AIConversationSummary> {
  const data = await aiJson<{ conversation: AIConversationSummary }>(
    "/api/ai/conversations",
    "POST",
    { kind, ...opts },
  );
  return data.conversation;
}

export async function getConversation(
  id: string,
): Promise<{ conversation: AIConversationSummary; messages: AIMessageDto[] }> {
  return aiJson<{ conversation: AIConversationSummary; messages: AIMessageDto[] }>(
    `/api/ai/conversations/${id}`,
    "GET",
  );
}

export async function renameConversation(id: string, title: string): Promise<AIConversationSummary> {
  const data = await aiJson<{ conversation: AIConversationSummary }>(
    `/api/ai/conversations/${id}`,
    "PATCH",
    { title },
  );
  return data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  await aiJson<{ ok: boolean }>(`/api/ai/conversations/${id}`, "DELETE");
}

export async function submitFeedback(opts: {
  messageId?: string;
  rating: "HELPFUL" | "NOT_HELPFUL";
  category?: string;
  comment?: string;
}): Promise<{ ok: boolean }> {
  return aiJson<{ ok: boolean }>("/api/ai/feedback", "POST", opts);
}
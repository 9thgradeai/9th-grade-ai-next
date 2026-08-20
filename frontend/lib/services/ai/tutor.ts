"use client";

import { streamChat, type StreamChatMeta } from "./client";
import type { AIIntent } from "./types";

export type TutorTurnOptions = {
  conversationId?: string;
  content: string;
  subjectId?: number;
  topicId?: number;
  topicPath?: string;
  questionId?: number;
  intent?: AIIntent;
  onChunk: (chunk: string) => void;
  signal?: AbortSignal;
};

/** Send a single tutor turn and stream the AI reply. */
export async function tutorTurn(opts: TutorTurnOptions): Promise<StreamChatMeta> {
  const body: Record<string, unknown> = {
    messages: [{ role: "user", content: opts.content }],
  };
  if (opts.conversationId) body.conversationId = opts.conversationId;
  if (opts.subjectId) body.subjectId = opts.subjectId;
  if (opts.topicId) body.topicId = opts.topicId;
  if (opts.topicPath) body.topicPath = opts.topicPath;
  if (opts.questionId) body.questionId = opts.questionId;
  if (opts.intent) body.intent = opts.intent;

  return streamChat({
    url: "/api/ai/tutor",
    body,
    onChunk: opts.onChunk,
    signal: opts.signal,
  });
}
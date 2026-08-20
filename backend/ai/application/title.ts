// Conversation title summarization — derives a short, meaningful title from
// the whole chat transcript. Uses the model when one is configured; otherwise
// falls back to the first learner message. Safe to fire-and-forget: failures
// leave the existing title untouched.

import "server-only";

import { listMessages, renameConversation } from "../persistence/conversations";
import { resolveModel } from "../providers";
import { sanitizeReply } from "../validation/outputs";
import { TITLE_SYSTEM } from "../prompts/title";

export const DEFAULT_TITLE = "New conversation";
const MAX_TITLE_CHARS = 120;
const MAX_TRANSCRIPT_CHARS = 4_000;
const MAX_TRANSCRIPT_MESSAGES = 20;

/** Clean model output into a presentable title string. */
export function sanitizeTitle(raw: string): string {
  const cleaned = sanitizeReply(raw)
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[#*\-•.\s]+|[#*\-•.\s]+$/g, "")
    .replace(/[.。:：;；\s]+$/, "");
  return cleaned.slice(0, MAX_TITLE_CHARS);
}

/**
 * Build a condensed transcript of a conversation's messages for the model.
 */
export function buildTranscript(messages: { role: string; status: string; content: string }[]): string {
  return messages
    .filter((m) => m.role !== "SYSTEM" && m.status === "COMPLETE")
    .slice(-MAX_TRANSCRIPT_MESSAGES)
    .map((m) => `${m.role === "USER" ? "Learner" : "Tutor"}: ${m.content}`)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

/**
 * Summarize the whole conversation into a title and rename it. Non-fatal —
 * any failure keeps the existing title.
 */
export async function summarizeConversationTitle(userId: string, conversationId: string): Promise<void> {
  try {
    const messages = await listMessages(userId, conversationId);
    const transcript = buildTranscript(messages);
    if (!transcript) return;

    const { provider, name } = resolveModel("tutor");
    let title = "";
    if (name !== "mock") {
      try {
        const result = await provider.generate({
          system: TITLE_SYSTEM,
          messages: [{ role: "user", content: transcript }],
          maxTokens: 40,
          temperature: 0.3,
        });
        title = sanitizeTitle(result.text);
      } catch {
        title = "";
      }
    }

    if (!title) {
      const firstUser = messages.find((m) => m.role === "USER");
      title = sanitizeTitle(firstUser?.content ?? "");
    }

    if (title && title !== DEFAULT_TITLE) {
      await renameConversation(userId, conversationId, title);
    }
  } catch {
    // Non-fatal: keep the existing title.
  }
}
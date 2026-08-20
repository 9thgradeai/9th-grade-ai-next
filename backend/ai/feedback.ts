// AI feedback — lightweight user feedback on AI responses. Seeds the future
// evaluation set.

import "server-only";

import { prisma } from "~backend/db";
import { getOwnedMessage } from "./persistence/conversations";
import type { AIFeedbackRating } from "@prisma/client";

export async function submitFeedback(opts: {
  userId: string;
  messageId?: string;
  rating: "HELPFUL" | "NOT_HELPFUL";
  category?: string;
  comment?: string;
}): Promise<{ id: string }> {
  if (opts.messageId) {
    // Ownership check: message must belong to this user's conversation.
    await getOwnedMessage(opts.userId, opts.messageId);
  }
  const row = await prisma.aIFeedback.create({
    data: {
      userId: opts.userId,
      messageId: opts.messageId,
      rating: opts.rating as AIFeedbackRating,
      category: opts.category ?? "",
      comment: opts.comment ?? "",
    },
    select: { id: true },
  });
  return { id: row.id };
}
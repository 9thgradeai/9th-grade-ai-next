// AI feedback — lightweight user feedback on AI responses. Seeds the future
// evaluation set.
//
// AI6 eval loop: `summarizeFeedback` aggregates the ledger into helpful-rates
// per intent/provider/model plus top complaint categories. `getFeedbackSummary`
// fetches a bounded window and `scripts/ai-feedback-report.ts` renders it for
// prompt/model decisions. Aggregation is PURE (unit-tested); only the fetch
// touches the database.

import "server-only";

import { prisma } from "~backend/db";
import { AppError } from "~backend/errors";
import { checkWriteRateLimit } from "./security/hardening";
import { getOwnedMessage } from "./persistence/conversations";
import type { AIFeedbackRating } from "@prisma/client";
import { summarizeFeedback } from "./feedback-summary";
import type { FeedbackSummary } from "./feedback-summary";

export type { FeedbackRow, FeedbackSummary } from "./feedback-summary";
export { summarizeFeedback };

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
  // Write throttle (defense-in-depth alongside global quotas): a client
  // spamming feedback rows gets a 429, not a silent accept.
  const gate = checkWriteRateLimit(`feedback:${opts.userId}`);
  if (!gate.allowed) {
    throw new AppError(429, "Too much feedback too fast. Please slow down.", "RATE_LIMIT_EXCEEDED");
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

/** Bounded fetch (newest first) + pure summary. */
export async function getFeedbackSummary(windowDays = 30): Promise<FeedbackSummary> {
  const MAX_ROWS = 5000;
  const cutoff = new Date(Date.now() - Math.max(1, windowDays) * 86_400_000);
  const rows = await prisma.aIFeedback.findMany({
    where: { createdAt: { gte: cutoff } },
    select: {
      rating: true,
      category: true,
      message: { select: { intent: true, provider: true, model: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS + 1,
  });
  const truncated = rows.length > MAX_ROWS;
  const summary = summarizeFeedback(rows.slice(0, MAX_ROWS));
  return { ...summary, truncated };
}
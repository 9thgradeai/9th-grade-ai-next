// backend/ai/feedback-summary.ts — pure AIFeedback aggregation (AI6 eval loop).
//
// Deliberately free of `server-only` and Prisma imports so CLI scripts
// (tsx) can use it directly. DB access lives in ./feedback (getFeedbackSummary).

export type FeedbackRow = {
  rating: "HELPFUL" | "NOT_HELPFUL" | string;
  category: string | null;
  message?: {
    intent?: string | null;
    provider?: string | null;
    model?: string | null;
  } | null;
};

export type FeedbackSummary = {
  total: number;
  helpfulRate: number | null;
  byRating: { HELPFUL: number; NOT_HELPFUL: number };
  /** Complaint categories, worst first. Empty category = uncategorized. */
  byCategory: { category: string; count: number; notHelpful: number }[];
  byIntent: { intent: string; total: number; helpfulRate: number | null }[];
  byProvider: { provider: string; model: string; total: number; helpfulRate: number | null }[];
  /** True when the fetch hit the row cap — rates are computed on the newest N. */
  truncated: boolean;
};

function rate(helpful: number, total: number): number | null {
  return total === 0 ? null : Math.round((helpful / total) * 100);
}

/** Pure aggregation over feedback rows joined to their message context. */
export function summarizeFeedback(rows: FeedbackRow[]): Omit<FeedbackSummary, "truncated"> {
  let helpful = 0;
  const byCategory = new Map<string, { count: number; notHelpful: number }>();
  const byIntent = new Map<string, { total: number; helpful: number }>();
  const byProvider = new Map<string, { total: number; helpful: number }>();

  for (const r of rows) {
    const good = r.rating === "HELPFUL";
    if (good) helpful += 1;

    const cat = (r.category ?? "").trim() || "(uncategorized)";
    const c = byCategory.get(cat) ?? { count: 0, notHelpful: 0 };
    c.count += 1;
    if (!good) c.notHelpful += 1;
    byCategory.set(cat, c);

    const intent = (r.message?.intent ?? "").trim() || "(unknown)";
    const it = byIntent.get(intent) ?? { total: 0, helpful: 0 };
    it.total += 1;
    if (good) it.helpful += 1;
    byIntent.set(intent, it);

    const provider = (r.message?.provider ?? "").trim() || "(unknown)";
    const model = (r.message?.model ?? "").trim() || "(unknown)";
    const key = `${provider} / ${model}`;
    const pv = byProvider.get(key) ?? { total: 0, helpful: 0 };
    pv.total += 1;
    if (good) pv.helpful += 1;
    byProvider.set(key, pv);
  }

  return {
    total: rows.length,
    helpfulRate: rate(helpful, rows.length),
    byRating: {
      HELPFUL: helpful,
      NOT_HELPFUL: rows.length - helpful,
    },
    byCategory: [...byCategory.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.notHelpful - a.notHelpful || b.count - a.count),
    byIntent: [...byIntent.entries()]
      .map(([intent, v]) => ({ intent, total: v.total, helpfulRate: rate(v.helpful, v.total) }))
      .sort((a, b) => b.total - a.total),
    byProvider: [...byProvider.entries()]
      .map(([key, v]) => {
        const [provider, model] = key.split(" / ");
        return { provider, model, total: v.total, helpfulRate: rate(v.helpful, v.total) };
      })
      .sort((a, b) => b.total - a.total),
  };
}

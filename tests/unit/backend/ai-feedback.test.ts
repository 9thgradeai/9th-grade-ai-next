import { describe, it, expect } from "vitest";
import { summarizeFeedback } from "~backend/ai/feedback";

describe("summarizeFeedback (AI6 eval aggregation)", () => {
  it("returns null rates on empty input", () => {
    const s = summarizeFeedback([]);
    expect(s).toMatchObject({ total: 0, helpfulRate: null });
    expect(s.byIntent).toEqual([]);
    expect(s.byProvider).toEqual([]);
    expect(s.byCategory).toEqual([]);
  });

  it("aggregates ratings, intents, providers, and complaint categories", () => {
    const s = summarizeFeedback([
      { rating: "HELPFUL", category: "", message: { intent: "tutor", provider: "groq", model: "m1" } },
      { rating: "NOT_HELPFUL", category: "hallucination", message: { intent: "tutor", provider: "groq", model: "m1" } },
      { rating: "NOT_HELPFUL", category: "hallucination", message: { intent: "solve", provider: "anthropic", model: "m2" } },
      { rating: "HELPFUL", category: "", message: null },
    ]);
    expect(s.total).toBe(4);
    expect(s.helpfulRate).toBe(50);
    expect(s.byRating).toEqual({ HELPFUL: 2, NOT_HELPFUL: 2 });
    // Worst complaint category first.
    expect(s.byCategory[0]).toMatchObject({ category: "hallucination", count: 2, notHelpful: 2 });
    const intent = new Map(s.byIntent.map((r) => [r.intent, r]));
    expect(intent.get("tutor")).toMatchObject({ total: 2, helpfulRate: 50 });
    expect(intent.get("solve")).toMatchObject({ total: 1, helpfulRate: 0 });
    expect(intent.get("(unknown)")).toMatchObject({ total: 1, helpfulRate: 100 });
    const prov = new Map(s.byProvider.map((r) => [`${r.provider}/${r.model}`, r]));
    expect(prov.get("groq/m1")).toMatchObject({ total: 2, helpfulRate: 50 });
  });
});

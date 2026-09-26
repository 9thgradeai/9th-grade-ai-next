import { describe, it, expect, afterEach } from "vitest";
import { resolveExplainCandidates } from "~backend/ai/providers/registry";

const SAVED = {
  explain: process.env.GROQ_API_KEY_EXPLAIN,
  groq: process.env.GROQ_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
};

afterEach(() => {
  if (SAVED.explain !== undefined) process.env.GROQ_API_KEY_EXPLAIN = SAVED.explain;
  else delete process.env.GROQ_API_KEY_EXPLAIN;
  if (SAVED.groq !== undefined) process.env.GROQ_API_KEY = SAVED.groq;
  else delete process.env.GROQ_API_KEY;
  if (SAVED.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = SAVED.anthropic;
  else delete process.env.ANTHROPIC_API_KEY;
});

describe("explain provider chain (AI Exp. buttons)", () => {
  it("leads with groq on the dedicated explain key", () => {
    process.env.GROQ_API_KEY_EXPLAIN = "gsk_test_explain_key";
    process.env.ANTHROPIC_API_KEY = "";
    const chain = resolveExplainCandidates();
    expect(chain[0].name).toBe("groq");
    expect(chain[chain.length - 1].name).toBe("mock");
  });

  it("falls back to the shared groq key when no dedicated key is set", () => {
    delete process.env.GROQ_API_KEY_EXPLAIN;
    process.env.GROQ_API_KEY = "gsk_test_shared_key";
    process.env.ANTHROPIC_API_KEY = "";
    const chain = resolveExplainCandidates();
    expect(chain[0].name).toBe("groq");
    expect(chain[chain.length - 1].name).toBe("mock");
  });

  it("degrades to labelled mock when no key is configured", () => {
    delete process.env.GROQ_API_KEY_EXPLAIN;
    process.env.GROQ_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "";
    const chain = resolveExplainCandidates();
    expect(chain).toHaveLength(1);
    expect(chain[0].name).toBe("mock");
  });
});

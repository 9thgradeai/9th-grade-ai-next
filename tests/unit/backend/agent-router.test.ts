import { describe, it, expect, beforeEach } from "vitest";
import { tierForTask } from "~backend/ai/router/tasks";
import { candidateOrder, modelRouteFor, resolveModelName } from "~backend/ai/router";
import { resolveCandidatesForModelTask } from "~backend/ai/providers/registry";
import type { LLMProviderName } from "~backend/ai/providers/types";

describe("model router", () => {
  it("maps tasks to the fast vs primary tier", () => {
    expect(tierForTask("classification")).toBe("fast");
    expect(tierForTask("summary")).toBe("fast");
    expect(tierForTask("agent_reasoning")).toBe("primary");
    expect(tierForTask("complex_tutoring")).toBe("primary");
  });

  it("preserves default provider ordering without AI_PROVIDER", () => {
    const order = candidateOrder({});
    expect(order).toEqual(["groq", "anthropic", "mock"]);
    expect(candidateOrder({ solverLike: true })).toEqual(["anthropic", "groq", "mock"]);
    expect(candidateOrder({ image: true })).toEqual(["anthropic", "mock"]);
  });

  it("resolves a concrete model for a provider + tier", () => {
    const name = resolveModelName("groq", "primary");
    expect(typeof name).toBe("string");
    expect(name.length).toBeGreaterThan(0);
    expect(modelRouteFor("groq", "agent_reasoning").tier).toBe("primary");
    expect(modelRouteFor("anthropic", "summary").tier).toBe("fast");
  });
});

describe("provider registry (tier-aware candidates)", () => {
  const originalKeys = { groq: process.env.GROQ_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY };

  beforeEach(() => {
    // Force a mock-only environment (deterministic, no network).
    process.env.GROQ_API_KEY = "";
    process.env.ANTHROPIC_API_KEY = "";
  });

  it("always ends with a labelled mock fallback", () => {
    const candidates = resolveCandidatesForModelTask("agent_reasoning");
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[candidates.length - 1].name).toBe("mock");
  });

  it("constructs mock providers per task seed", () => {
    const [a, b] = [resolveCandidatesForModelTask("agent_reasoning")[0], resolveCandidatesForModelTask("summary")[0]];
    expect(a.name).toBe("mock");
    expect(b.name).toBe("mock");
  });

  afterAll(() => {
    if (originalKeys.groq !== undefined) process.env.GROQ_API_KEY = originalKeys.groq;
    else delete process.env.GROQ_API_KEY;
    if (originalKeys.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = originalKeys.anthropic;
    else delete process.env.ANTHROPIC_API_KEY;
  });
});
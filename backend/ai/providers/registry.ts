// ModelRouter — maps an AI task to a concrete provider/model.
// The application depends on this, never on Groq/Anthropic directly.
// Strategy: open-source primary (Groq gpt-oss-120b) with optional hosted
// fallback (Anthropic), and a clearly-labelled mock when no key is set.

import "server-only";

import type { AITask } from "../types";
import { GroqProvider, isGroqConfigured } from "./groq";
import { AnthropicProvider, isAnthropicConfigured } from "./anthropic";
import { MockProvider } from "./mock";
import type { LLMProvider, LLMProviderName } from "./types";

const cache = new Map<string, LLMProvider>();

function getProvider(name: LLMProviderName, task: AITask): LLMProvider {
  const cacheKey = `${name}:${task}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let provider: LLMProvider;
  switch (name) {
    case "groq":
      provider = new GroqProvider(process.env.GROQ_API_KEY as string);
      break;
    case "anthropic":
      provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY as string);
      break;
    case "mock":
      provider = new MockProvider(task);
      break;
  }
  cache.set(cacheKey, provider);
  return provider;
}

export type ModelSelection = {
  provider: LLMProvider;
  name: LLMProviderName;
};

/**
 * Resolve an ordered list of provider candidates for a task. The application
 * layer tries each in turn (runtime failover) and only falls back to the next
 * on a real provider error — so a Groq outage no longer surfaces as a hard
 * error; it degrades to Anthropic, then to the clearly-labelled mock.
 *
 * Ordering preferences:
 * - tutor / assistant: Groq (open-source, fast, free-tier) → Anthropic → mock
 * - solver text: Anthropic (reasoning quality) → Groq → mock
 * - solver image: Anthropic (vision) → mock
 */
export function resolveModelCandidates(task: AITask, opts?: { image?: boolean }): ModelSelection[] {
  const { image = false } = opts ?? {};

  const pick = (name: LLMProviderName): ModelSelection | null => {
    if (name === "groq" && isGroqConfigured()) return { provider: getProvider("groq", task), name: "groq" };
    if (name === "anthropic" && isAnthropicConfigured())
      return { provider: getProvider("anthropic", task), name: "anthropic" };
    return null;
  };

  const order: LLMProviderName[] =
    task === "solver" && image
      ? ["anthropic", "mock"]
      : task === "solver"
        ? ["anthropic", "groq", "mock"]
        : ["groq", "anthropic", "mock"];

  const out: ModelSelection[] = [];
  for (const name of order) {
    if (name === "mock") {
      out.push({ provider: getProvider("mock", task), name: "mock" });
      break;
    }
    const candidate = pick(name);
    if (candidate) out.push(candidate);
  }
  // Guarantee a mock fallback even if no real provider was configured.
  if (out.length === 0 || out[out.length - 1].name !== "mock") {
    out.push({ provider: getProvider("mock", task), name: "mock" });
  }
  return out;
}

/**
 * Resolve a provider for a task. Ordering preferences:
 * - tutor / assistant: Groq (open-source, fast, free-tier) → Anthropic → mock
 * - solver text: Anthropic (reasoning quality) → Groq → mock
 * - solver image: Anthropic (vision) → mock
 */
export function resolveModel(task: AITask, opts?: { image?: boolean }): ModelSelection {
  return resolveModelCandidates(task, opts)[0];
}

/** Provider name for a task with the same resolution order (cheap check). */
export function resolvedProviderName(task: AITask, opts?: { image?: boolean }): LLMProviderName {
  return resolveModel(task, opts).name;
}
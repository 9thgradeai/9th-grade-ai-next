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
 * Resolve a provider for a task. Ordering preferences:
 * - tutor / assistant: Groq (open-source, fast, free-tier) → Anthropic → mock
 * - solver text: Anthropic (reasoning quality) → Groq → mock
 * - solver image: Anthropic (vision) → mock
 */
export function resolveModel(task: AITask, opts?: { image?: boolean }): ModelSelection {
  const { image = false } = opts ?? {};

  if (task === "solver") {
    if (image) {
      if (isAnthropicConfigured()) {
        return { provider: getProvider("anthropic", task), name: "anthropic" };
      }
      return { provider: getProvider("mock", task), name: "mock" };
    }
    if (isAnthropicConfigured()) {
      return { provider: getProvider("anthropic", task), name: "anthropic" };
    }
    if (isGroqConfigured()) {
      return { provider: getProvider("groq", task), name: "groq" };
    }
    return { provider: getProvider("mock", task), name: "mock" };
  }

  // tutor / assistant
  if (isGroqConfigured()) {
    return { provider: getProvider("groq", task), name: "groq" };
  }
  if (isAnthropicConfigured()) {
    return { provider: getProvider("anthropic", task), name: "anthropic" };
  }
  return { provider: getProvider("mock", task), name: "mock" };
}

/** Provider name for a task with the same resolution order (cheap check). */
export function resolvedProviderName(task: AITask, opts?: { image?: boolean }): LLMProviderName {
  return resolveModel(task, opts).name;
}
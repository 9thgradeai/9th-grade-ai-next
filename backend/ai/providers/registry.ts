// ModelRouter — maps an AI task to a concrete provider/model.
// The application depends on this, never on Groq/Anthropic directly.
// Strategy: open-source primary (Groq gpt-oss-120b) with optional hosted
// fallback (Anthropic), and a clearly-labelled mock when no key is set.
// Provider/model selection honors the unified router config (AI_PROVIDER,
// AI_MODEL_PRIMARY / AI_MODEL_FAST) — see ~backend/ai/router.

import "server-only";

import { candidateOrder, resolveModelName, tierForTask, type ModelTask } from "../router";
import type { AITask } from "../types";
import { GroqProvider, isGroqConfigured } from "./groq";
import { AnthropicProvider, isAnthropicConfigured } from "./anthropic";
import { MockProvider } from "./mock";
import type { LLMProvider, LLMProviderName } from "./types";

const cache = new Map<string, LLMProvider>();

function getProvider(name: LLMProviderName, seed: string): LLMProvider {
  const cacheKey = `${name}:${seed}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  let provider: LLMProvider;
  switch (name) {
    case "groq":
      provider = new GroqProvider(process.env.GROQ_API_KEY as string, seed);
      break;
    case "anthropic":
      provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY as string, seed);
      break;
    case "mock":
      provider = new MockProvider(seed);
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
 * Build the ordered candidate list for a provider order. Each real provider is
 * constructed with its own resolved model name (tier-aware). The last candidate
 * is always the clearly-labelled mock.
 */
function buildSelections(
  order: LLMProviderName[],
  modelFor: (provider: Exclude<LLMProviderName, "mock">) => string,
  task: string,
): ModelSelection[] {
  const out: ModelSelection[] = [];
  for (const name of order) {
    if (name === "mock") {
      out.push({ provider: getProvider("mock", task), name: "mock" });
      break;
    }
    const configured = name === "groq" ? isGroqConfigured() : isAnthropicConfigured();
    if (!configured) continue;
    out.push({ provider: getProvider(name, modelFor(name)), name });
  }
  // Guarantee a mock fallback even if no real provider was configured.
  if (out.length === 0 || out[out.length - 1].name !== "mock") {
    out.push({ provider: getProvider("mock", task), name: "mock" });
  }
  return out;
}

/**
 * Resolve an ordered list of provider candidates for a task. The application
 * layer tries each in turn (runtime failover) and only falls back to the next
 * on a real provider error — so a provider outage degrades gracefully instead
 * of erroring.
 *
 * Ordering honors AI_PROVIDER (when set); otherwise preserves the historical
 * defaults (solver: Anthropic first; tutor/assistant: Groq first). Models use
 * the primary tier (existing endpoints are reasoning-heavy).
 */
export function resolveModelCandidates(task: AITask, opts?: { image?: boolean }): ModelSelection[] {
  const { image = false } = opts ?? {};
  const order = candidateOrder({ solverLike: task === "solver", image });
  return buildSelections(
    order,
    (provider) => resolveModelName(provider, "primary"),
    task,
  );
}

/**
 * Tier-aware candidate resolution for a ModelTask (the agent loop). Fast-tier
 * tasks resolve to AI_MODEL_FAST (or the provider fast default), everything
 * else to AI_MODEL_PRIMARY — while the provider failover chain stays intact.
 */
export function resolveCandidatesForModelTask(
  task: ModelTask,
  opts?: { image?: boolean },
): ModelSelection[] {
  const { image = false } = opts ?? {};
  const order = candidateOrder({ image });
  const tier = tierForTask(task);
  return buildSelections(order, (provider) => resolveModelName(provider, tier), "agent");
}

/**
 * Resolve a provider for a task (primary candidate only).
 */
export function resolveModel(task: AITask, opts?: { image?: boolean }): ModelSelection {
  return resolveModelCandidates(task, opts)[0];
}

/** Provider name for a task with the same resolution order (cheap check). */
export function resolvedProviderName(task: AITask, opts?: { image?: boolean }): LLMProviderName {
  return resolveModel(task, opts).name;
}
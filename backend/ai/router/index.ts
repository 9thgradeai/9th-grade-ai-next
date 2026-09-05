// Model Router — the AI provider-selection seam.
//
// Maps a ModelTask to an ordered list of provider candidates with concrete
// model names. The orchestration layer depends on this seam (via the provider
// registry) and never on Groq/Anthropic directly. Swapping the active model
// provider is a configuration change (AI_PROVIDER / AI_MODEL_* envs), not a
// code change.

import "server-only";

import type { LLMProviderName } from "../providers/types";
import { AI_CONFIG, resolveModelName, type AIProviderName, type AITier } from "./config";
import { tierForTask, type ModelTask } from "./tasks";

export { AI_CONFIG, resolveModelName, type AIProviderName, type AITier } from "./config";
export { tierForTask, type ModelTask } from "./tasks";

export type ModelRoute = {
  provider: AIProviderName;
  tier: AITier;
  model: string;
};

/**
 * Ordered provider list honoring the AI_PROVIDER override.
 *
 * - When AI_PROVIDER is set, that provider leads (the other real provider
 *   follows), so swappng providers is a single env var.
 * - Vision tasks always prefer Anthropic (`supportsVision`), because Groq's
 *   open-weight models cannot read images.
 * - Without an override, existing behavior is preserved: solver-style tasks
 *   prefer Anthropic; everything else prefers open-source Groq.
 */
export function candidateOrder(opts: {
  solverLike?: boolean;
  image?: boolean;
}): LLMProviderName[] {
  const { solverLike = false, image = false } = opts;
  const forced = AI_CONFIG.provider;

  if (forced) {
    if (image && forced === "groq") return ["anthropic", "mock"];
    const other: LLMProviderName = forced === "groq" ? "anthropic" : "groq";
    return [forced, other, "mock"];
  }
  if (image) return ["anthropic", "mock"];
  if (solverLike) return ["anthropic", "groq", "mock"];
  return ["groq", "anthropic", "mock"];
}

/** Full route resolution for a ModelTask on a given provider. */
export function modelRouteFor(provider: AIProviderName, task: ModelTask): ModelRoute {
  const tier = tierForTask(task);
  return { provider, tier, model: resolveModelName(provider, tier) };
}
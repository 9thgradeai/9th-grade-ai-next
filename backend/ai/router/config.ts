// AI model configuration — single source of truth for provider/model selection.
// Reads from env so provider/model swaps are configuration changes, not code edits:
//   AI_PROVIDER          - preferred provider: "groq" | "anthropic" (optional)
//   AI_MODEL_PRIMARY     - model name for primary-tier tasks (overrides provider default)
//   AI_MODEL_FAST        - model name for fast-tier tasks (overrides provider default)
//   AI_TEMPERATURE       - default sampling temperature
//   AI_MAX_OUTPUT_TOKENS - default max output tokens
//   AI_REASONING_EFFORT  - "low" | "medium" | "high"

import "server-only";

export type AIProviderName = "groq" | "anthropic";
export type AITier = "fast" | "primary";

export const AI_CONFIG = {
  provider: process.env.AI_PROVIDER as AIProviderName | "",
  modelPrimary: process.env.AI_MODEL_PRIMARY ?? "",
  modelFast: process.env.AI_MODEL_FAST ?? "",
  temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : undefined,
  maxOutputTokens: process.env.AI_MAX_OUTPUT_TOKENS
    ? Number(process.env.AI_MAX_OUTPUT_TOKENS)
    : undefined,
  reasoningEffort: (process.env.AI_REASONING_EFFORT ?? "medium") as "low" | "medium" | "high",
};

/**
 * Resolve the concrete model name for a provider + tier.
 *
 * Priority:
 *  1. Unified `AI_MODEL_PRIMARY` / `AI_MODEL_FAST` (applies to whichever provider is active).
 *  2. Legacy provider-specific env (`AI_GROQ_MODEL` / `AI_ANTHROPIC_MODEL`).
 *  3. Provider default (open-source Groq / hosted Claude).
 */
export function resolveModelName(provider: AIProviderName, tier: AITier): string {
  const global = tier === "primary" ? AI_CONFIG.modelPrimary : AI_CONFIG.modelFast;
  if (global) return global;
  if (provider === "groq") return process.env.AI_GROQ_MODEL ?? "openai/gpt-oss-120b";
  return process.env.AI_ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
}
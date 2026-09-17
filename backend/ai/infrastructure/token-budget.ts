// Token budget enforcement — prevents runaway token consumption on a per-request
// basis. Enforces limits on input size, output size, and total tokens per AI call.
// Fails fast with a clear error rather than letting the model consume unlimited tokens.

import "server-only";

import { AppError } from "~backend/errors";

// ── Types ──────────────────────────────────────────────────

export type TokenBudget = {
  /** Maximum input tokens (system + messages). Enforced before the LLM call. */
  maxInputTokens: number;
  /** Maximum output tokens (maxTokens parameter to the LLM). */
  maxOutputTokens: number;
  /** Maximum total tokens (input + output). Checked after the call. */
  maxTotalTokens: number;
  /** Maximum character count for the system prompt. */
  maxSystemPromptChars: number;
  /** Maximum character count for all messages combined. */
  maxMessageChars: number;
};

// ── Defaults ───────────────────────────────────────────────

export const TUTOR_BUDGET: TokenBudget = {
  maxInputTokens: 12_000,
  maxOutputTokens: 2048,
  maxTotalTokens: 14_000,
  maxSystemPromptChars: 6_000,
  maxMessageChars: 16_000, // ~30 messages × ~530 chars each
};

export const SOLVER_BUDGET: TokenBudget = {
  maxInputTokens: 8_000,
  maxOutputTokens: 2048,
  maxTotalTokens: 10_000,
  maxSystemPromptChars: 4_000,
  maxMessageChars: 8_000,
};

export const ASSISTANT_BUDGET: TokenBudget = {
  maxInputTokens: 10_000,
  maxOutputTokens: 2048,
  maxTotalTokens: 12_000,
  maxSystemPromptChars: 5_000,
  maxMessageChars: 12_000,
};

export const AGENT_BUDGET: TokenBudget = {
  maxInputTokens: 10_000,
  maxOutputTokens: 4000,
  maxTotalTokens: 14_000,
  maxSystemPromptChars: 6_000,
  maxMessageChars: 12_000,
};

export const EVALUATOR_BUDGET: TokenBudget = {
  maxInputTokens: 8_000,
  maxOutputTokens: 1024,
  maxTotalTokens: 9_000,
  maxSystemPromptChars: 3_000,
  maxMessageChars: 6_000,
};

// ── Token estimation ───────────────────────────────────────

/** Rough token estimate (chars / 4). Used for pre-call budget checks. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Estimate total input tokens for a request. */
export function estimateInputTokens(system: string, messages: { content: string }[]): number {
  const systemTokens = estimateTokens(system);
  const messageTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  return systemTokens + messageTokens;
}

// ── Budget enforcement ─────────────────────────────────────

/**
 * Validate that a request fits within the token budget BEFORE making
 * the LLM call. Throws ValidationError if limits are exceeded.
 */
export function enforceInputBudget(
  system: string,
  messages: { content: string }[],
  budget: TokenBudget = TUTOR_BUDGET,
): void {
  // Check system prompt length
  if (system.length > budget.maxSystemPromptChars) {
    throw new AppError(
      400,
      `System prompt too long (${system.length} chars, max ${budget.maxSystemPromptChars}).`,
      "PROMPT_TOO_LONG",
    );
  }

  // Check total message length
  const totalMessageChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalMessageChars > budget.maxMessageChars) {
    throw new AppError(
      400,
      `Messages too long (${totalMessageChars} chars, max ${budget.maxMessageChars}).`,
      "MESSAGES_TOO_LONG",
    );
  }

  // Check estimated input tokens
  const estimated = estimateInputTokens(system, messages);
  if (estimated > budget.maxInputTokens) {
    throw new AppError(
      400,
      `Input too large (~${estimated} tokens, max ${budget.maxInputTokens}). Try a shorter message or start a new conversation.`,
      "INPUT_TOO_LARGE",
    );
  }
}

/**
 * Validate that an LLM response didn't exceed the output budget.
 * Returns the clamped maxTokens to use for the actual call.
 */
export function clampMaxTokens(
  requested: number | undefined,
  budget: TokenBudget = TUTOR_BUDGET,
): number {
  const requestedTokens = requested ?? budget.maxOutputTokens;
  return Math.min(requestedTokens, budget.maxOutputTokens);
}

/**
 * Post-call validation: check that total tokens (input + output) didn't
 * exceed the budget. Logs a warning but doesn't throw (the call already
 * succeeded).
 */
export function validateTotalBudget(
  inputTokens: number,
  outputTokens: number,
  budget: TokenBudget = TUTOR_BUDGET,
): { withinBudget: boolean; totalTokens: number } {
  const totalTokens = inputTokens + outputTokens;
  return {
    withinBudget: totalTokens <= budget.maxTotalTokens,
    totalTokens,
  };
}

/**
 * Truncate messages to fit within character budget, preserving the most
 * recent messages and always keeping the first user message.
 */
export function truncateMessages(
  messages: { role: string; content: string }[],
  maxChars: number,
): { role: string; content: string }[] {
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars <= maxChars) return messages;

  // Always keep first message (context) and work backwards from most recent
  const first = messages[0];
  let remaining = maxChars - first.content.length;
  const kept: { role: string; content: string }[] = [first];

  for (let i = messages.length - 1; i >= 1; i--) {
    const msg = messages[i];
    if (remaining - msg.content.length < 0) break;
    remaining -= msg.content.length;
    kept.unshift(msg);
  }

  return kept;
}

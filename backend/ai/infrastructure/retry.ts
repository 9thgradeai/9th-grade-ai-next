// Retry utility with exponential backoff and jitter.
// Used by provider calls and tool executions to handle transient failures.

import "server-only";

import { log } from "~backend/infrastructure/observability/logger";

// ── Types ──────────────────────────────────────────────────

export type RetryConfig = {
  /** Maximum number of attempts (including the first attempt). */
  maxAttempts: number;
  /** Base delay in ms (doubled each retry, with jitter). */
  baseDelayMs: number;
  /** Maximum delay in ms (cap to prevent excessive waits). */
  maxDelayMs: number;
  /** Optional predicate: return true to retry on this error. */
  retryOn?: (error: unknown) => boolean;
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
};

// ── Helpers ────────────────────────────────────────────────

function jitter(ms: number): number {
  return ms + Math.random() * ms * 0.3; // 0-30% jitter
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Retry on transient network/provider errors
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("socket hang up") ||
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("overloaded") ||
      msg.includes("empty response")
    );
  }
  return false;
}

// ── Core retry ─────────────────────────────────────────────

export type RetryResult<T> = {
  result: T;
  attempts: number;
  totalMs: number;
};

/**
 * Execute an async function with retry and exponential backoff.
 * Returns the result on success, or throws the last error after all attempts.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  labels?: Record<string, string>,
): Promise<RetryResult<T>> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  const shouldRetry = cfg.retryOn ?? isRetryableError;

  const start = Date.now();
  let lastError: unknown;

  for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
    try {
      const result = await fn();
      const totalMs = Date.now() - start;
      if (attempt > 1) {
        log.info("ai.retry.success", {
          attempt,
          totalMs,
          ...labels,
        });
      }
      return { result, attempts: attempt, totalMs };
    } catch (err) {
      lastError = err;
      if (attempt < cfg.maxAttempts && shouldRetry(err)) {
        const delayMs = jitter(Math.min(cfg.baseDelayMs * Math.pow(2, attempt - 1), cfg.maxDelayMs));
        log.debug("ai.retry.backoff", {
          attempt,
          delayMs: Math.round(delayMs),
          error: err instanceof Error ? err.message : "unknown",
          ...labels,
        });
        await delay(delayMs);
      }
    }
  }

  const totalMs = Date.now() - start;
  log.warn("ai.retry.exhausted", {
    attempts: cfg.maxAttempts,
    totalMs,
    error: lastError instanceof Error ? lastError.message : "unknown",
    ...labels,
  });
  throw lastError;
}

/**
 * Execute with retry, returning null instead of throwing on final failure.
 * Useful for optional/degraded operations (cache, title generation, etc.).
 */
export async function withRetryOrFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  config: Partial<RetryConfig> = {},
  labels?: Record<string, string>,
): Promise<T> {
  try {
    const { result } = await withRetry(fn, config, labels);
    return result;
  } catch {
    return fallback;
  }
}

// Request deduplication — prevents duplicate concurrent AI calls for the same
// user + input combination. Uses a short-lived in-memory cache keyed by a
// hash of the request. Dedup window is 10 seconds (enough to catch double-
// clicks but not so long that it stale-deduplicates legitimate retries).

import "server-only";

// ── Types ──────────────────────────────────────────────────

type PendingRequest<T> = {
  promise: Promise<T>;
  createdAt: number;
};

// ── Dedup store ────────────────────────────────────────────

const pending = new Map<string, PendingRequest<unknown>>();
const DEDUP_WINDOW_MS = 10_000; // 10 seconds

// ── Hash ───────────────────────────────────────────────────

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function buildDedupKey(userId: string, task: string, input: string): string {
  // Truncate input to avoid hashing huge prompts; 500 chars is enough for dedup
  const truncated = input.length > 500 ? input.slice(0, 500) : input;
  return djb2Hash(`${userId}:${task}:${truncated}`);
}

// ── Cleanup ────────────────────────────────────────────────

function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (now - entry.createdAt > DEDUP_WINDOW_MS) {
      pending.delete(key);
    }
  }
}

// Run cleanup periodically (max once per 30 seconds)
let lastCleanup = 0;
function maybeCleanup(): void {
  const now = Date.now();
  if (now - lastCleanup > 30_000) {
    lastCleanup = now;
    cleanup();
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Execute a function with deduplication. If the same userId+task+input
 * combination is already in-flight, returns the existing promise instead
 * of executing the function again.
 *
 * The dedup window is 10 seconds — enough to catch double-clicks and
 * browser refreshes, but not long enough to stale-deduplicate legitimate
 * retries after a real failure.
 */
export async function deduplicate<T>(
  userId: string,
  task: string,
  input: string,
  fn: () => Promise<T>,
): Promise<T> {
  maybeCleanup();

  const key = buildDedupKey(userId, task, input);
  const existing = pending.get(key);

  if (existing && Date.now() - existing.createdAt < DEDUP_WINDOW_MS) {
    return existing.promise as Promise<T>;
  }

  const promise = fn().finally(() => {
    pending.delete(key);
  });

  pending.set(key, { promise, createdAt: Date.now() });
  return promise;
}

/**
 * Check if a request is currently in-flight (for observability, not blocking).
 */
export function isInFlight(userId: string, task: string, input: string): boolean {
  const key = buildDedupKey(userId, task, input);
  const existing = pending.get(key);
  return !!existing && Date.now() - existing.createdAt < DEDUP_WINDOW_MS;
}

/**
 * Get count of currently in-flight deduped requests (for observability).
 */
export function getInFlightCount(): number {
  cleanup();
  return pending.size;
}

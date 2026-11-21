/**
 * Offline review queue for the Vocab tab.
 *
 * Ratings that fail to reach the API are kept in localStorage and retried on
 * reconnect. The queue is deduplicated by word: if the same word is rated
 * again while offline, the newest rating wins (a stale SRS update would
 * otherwise overwrite a more recent one on replay).
 */

export const VOCAB_REVIEW_QUEUE_KEY = "vocab:pendingReviews";

export type QueuedReview = {
  wordId: number;
  rating: number;
  at?: number;
};

/** Validate and dedupe arbitrary queue contents, keeping the last entry per word. */
export function normalizeQueuedReviews(raw: unknown): QueuedReview[] {
  if (!Array.isArray(raw)) return [];
  const byWord = new Map<number, QueuedReview>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    const wordId = candidate.wordId;
    const rating = candidate.rating;
    if (!Number.isInteger(wordId) || (wordId as number) <= 0) continue;
    if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 4) continue;
    byWord.set(wordId as number, {
      wordId: wordId as number,
      rating: rating as number,
      ...(typeof candidate.at === "number" ? { at: candidate.at } : {}),
    });
  }
  return Array.from(byWord.values());
}

export function readReviewQueue(): QueuedReview[] {
  if (typeof window === "undefined") return [];
  try {
    return normalizeQueuedReviews(JSON.parse(window.localStorage.getItem(VOCAB_REVIEW_QUEUE_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function writeReviewQueue(items: QueuedReview[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOCAB_REVIEW_QUEUE_KEY, JSON.stringify(normalizeQueuedReviews(items)));
  } catch {
    /* storage disabled / quota — reviews remain best-effort */
  }
}

/** Append a failed rating, replacing any older queued rating for the same word. */
export function enqueueReview(wordId: number, rating: number): QueuedReview[] {
  const queue = readReviewQueue();
  const next = normalizeQueuedReviews([...queue, { wordId, rating, at: Date.now() }]);
  writeReviewQueue(next);
  return next;
}

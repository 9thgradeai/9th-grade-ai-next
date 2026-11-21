import { describe, it, expect, beforeEach } from "vitest";
import {
  VOCAB_REVIEW_QUEUE_KEY,
  normalizeQueuedReviews,
  readReviewQueue,
  writeReviewQueue,
  enqueueReview,
} from "@/lib/vocab-review-queue";

beforeEach(() => {
  window.localStorage.clear();
});

describe("normalizeQueuedReviews", () => {
  it("ignores malformed, non-integer, and out-of-range ratings", () => {
    expect(normalizeQueuedReviews(null)).toEqual([]);
    expect(normalizeQueuedReviews({})).toEqual([]);
    expect(normalizeQueuedReviews([
      null,
      { wordId: 1, rating: 3 },
      { wordId: 0, rating: 3 },
      { wordId: 2, rating: 0 },
      { wordId: 3, rating: 5 },
      { wordId: 4.5, rating: 3 },
      { wordId: 5, rating: 2.5 },
      "garbage",
    ])).toEqual([{ wordId: 1, rating: 3 }]);
  });

  it("keeps the newest rating per word (dedupe)", () => {
    const result = normalizeQueuedReviews([
      { wordId: 7, rating: 2, at: 100 },
      { wordId: 7, rating: 4, at: 200 },
      { wordId: 8, rating: 3, at: 150 },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.wordId === 7)).toEqual({ wordId: 7, rating: 4, at: 200 });
  });
});

describe("review queue storage", () => {
  it("returns an empty queue when storage is empty or corrupt", () => {
    expect(readReviewQueue()).toEqual([]);
    window.localStorage.setItem(VOCAB_REVIEW_QUEUE_KEY, "{bad json");
    expect(readReviewQueue()).toEqual([]);
  });

  it("drops the legacy pseudo-id -1 and invalid entries when reading", () => {
    window.localStorage.setItem(VOCAB_REVIEW_QUEUE_KEY, JSON.stringify([
      { wordId: -1, rating: 3 },
      { wordId: 12, rating: 1 },
    ]));
    expect(readReviewQueue()).toEqual([{ wordId: 12, rating: 1 }]);
  });

  it("enqueue replaces an older rating for the same word", () => {
    window.localStorage.setItem(VOCAB_REVIEW_QUEUE_KEY, JSON.stringify([
      { wordId: 12, rating: 1, at: 100 },
    ]));
    const next = enqueueReview(12, 4);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ wordId: 12, rating: 4 });
    expect(readReviewQueue()).toHaveLength(1);

    enqueueReview(20, 2);
    expect(readReviewQueue().map((r) => r.wordId)).toEqual([12, 20]);
  });

  it("write normalizes before persisting", () => {
    writeReviewQueue([
      { wordId: 3, rating: 3 },
      { wordId: 3, rating: 1 },
      { wordId: -5, rating: 2 },
    ]);
    expect(readReviewQueue()).toEqual([{ wordId: 3, rating: 1 }]);
  });
});

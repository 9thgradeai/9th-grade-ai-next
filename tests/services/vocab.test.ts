import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~backend/db", () => ({
  prisma: {
    vocabWord: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    vocabProgress: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("~backend/../database/data/vocab-seed", () => ({
  VOCAB_SEED_DATA: [
    {
      word: "Mandate",
      bengaliMeaning: "আদেশ",
      partOfSpeech: "Noun",
      verbForms: null,
      synonyms: ["decree"],
      antonyms: ["suggestion"],
      exampleSentence: "The new mandate requires digital literacy.",
      exampleSentenceBn: "নতুন ম্যানডেট ডিজিটাল সাক্ষরতা বাধ্যতামূলক করে।",
      context: "Policy directives.",
      mnemonic: "Mandate = man + date.",
      examRelevance: ["BCS"],
      frequency: 92,
      difficulty: "EASY",
    },
  ],
}));

import { prisma } from "~backend/db";
import {
  getVocabWords,
  reviewVocabWord,
  getVocabStats,
  getVocabDailyProgress,
  seedVocabWords,
  type VocabWordDTO,
} from "~backend/services/vocab";

function mockWord(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    word: "Abandon",
    bengaliMeaning: "পরিত্যাগ করা",
    partOfSpeech: "Verb",
    verbForms: null,
    synonyms: null,
    antonyms: null,
    exampleSentence: "The government abandoned the policy.",
    exampleSentenceBn: null,
    context: "Policies and plans.",
    mnemonic: "Ab + abandon.",
    examRelevance: null,
    frequency: 95,
    difficulty: "EASY",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockProgress(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: "usr_123",
    wordId: 1,
    status: "LEARNING",
    ease: 2.5,
    interval: 1,
    repetitions: 1,
    nextReview: new Date(),
    lastReviewedAt: new Date(),
    totalReviews: 3,
    correctCount: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── seedVocabWords ────────────────────────────────────────

describe("seedVocabWords", () => {
  it("upserts all seed words and returns the count", async () => {
    vi.mocked(prisma.vocabWord.upsert).mockResolvedValue({} as never);

    const count = await seedVocabWords();

    expect(count).toBeGreaterThan(0);
    expect(prisma.vocabWord.upsert).toHaveBeenCalledTimes(count);
    expect(prisma.vocabWord.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ word: expect.any(String) }),
      }),
    );
  });
});

// ── getVocabWords ─────────────────────────────────────────

describe("getVocabWords", () => {
  beforeEach(() => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([mockWord()] as never);
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);
  });

  it("returns words without a user", async () => {
    const words = await getVocabWords();
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe("Abandon");
    expect(words[0].progress).toBeNull();
  });

  it("applies difficulty filter", async () => {
    await getVocabWords(undefined, { difficulty: "HARD" });
    expect(prisma.vocabWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { difficulty: "HARD" } }),
    );
  });

  it("skips difficulty filter for ALL", async () => {
    await getVocabWords(undefined, { difficulty: "ALL" });
    expect(prisma.vocabWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("applies text search filter", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([
      mockWord({ word: "Abandon", bengaliMeaning: "পরিত্যাগ" }),
      mockWord({ id: 2, word: "Benevolent", bengaliMeaning: "দয়ালু" }),
    ] as never);

    const words = await getVocabWords(undefined, { search: "benev" });
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe("Benevolent");
  });

  it("applies exam filter", async () => {
    vi.mocked(prisma.vocabWord.findMany).mockResolvedValue([
      mockWord({ examRelevance: ["BCS", "Bank"] }),
      mockWord({ id: 2, word: "Mitigate", examRelevance: ["9th Grade"] }),
    ] as never);

    const words = await getVocabWords(undefined, { exam: "BCS" });
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe("Abandon");
  });

  it("returns progress data when userId is provided", async () => {
    vi.mocked(prisma.vocabProgress.findMany)
      .mockResolvedValueOnce([mockProgress()] as never)
      .mockResolvedValueOnce([mockProgress()] as never);

    const words = await getVocabWords("usr_123");
    expect(words[0].progress).toBeDefined();
    expect(words[0].progress?.status).toBe("LEARNING");
  });

  it("caps limit at 100", async () => {
    await getVocabWords(undefined, { limit: 200 });
    expect(prisma.vocabWord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 }),
    );
  });

  it("filters NEW words by status", async () => {
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);

    const words = await getVocabWords("usr_123", { status: "NEW" });
    expect(words).toHaveLength(1);
  });

  it("filters DUE words by status", async () => {
    vi.mocked(prisma.vocabProgress.findMany)
      .mockResolvedValueOnce([mockProgress({ nextReview: new Date("2020-01-01") })] as never)
      .mockResolvedValueOnce([] as never);

    const words = await getVocabWords("usr_123", { status: "DUE" });
    expect(words).toHaveLength(1);
  });
});

// ── reviewVocabWord (SM-2 algorithm) ──────────────────────

describe("reviewVocabWord", () => {
  const wordId = 1;
  const userId = "usr_123";

  beforeEach(() => {
    vi.mocked(prisma.vocabWord.findUnique).mockResolvedValue(mockWord() as never);
  });

  it("throws when word is not found", async () => {
    vi.mocked(prisma.vocabWord.findUnique).mockResolvedValue(null);
    await expect(reviewVocabWord(userId, 999, 3)).rejects.toThrow("Word not found");
  });

  it("creates new progress for first review", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.vocabProgress.create).mockResolvedValue(mockProgress({ repetitions: 0, ease: 2.5 }) as never);
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress({ repetitions: 1, interval: 1 }) as never);

    const result = await reviewVocabWord(userId, wordId, 3);
    expect(result.progress).toBeDefined();
    expect(result.word).toBeDefined();
    expect(prisma.vocabProgress.create).toHaveBeenCalled();
  });

  it("increments repetitions on 'good' (rating=3) from NEW status", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "NEW", repetitions: 0, interval: 1, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    const result = await reviewVocabWord(userId, wordId, 3);
    expect(result.progress).toBeDefined();
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.repetitions).toBe(1);
    expect(updateCall.data.interval).toBe(1);
  });

  it("jumps to 6 days on second 'good' review from NEW", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "NEW", repetitions: 1, interval: 1, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 3);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.interval).toBe(6);
    expect(updateCall.data.repetitions).toBe(2);
  });

  it("multiplies interval by ease on subsequent reviews", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "REVIEW", repetitions: 2, interval: 6, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 3);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.interval).toBe(15); // round(6 * 2.5)
  });

  it("'easy' (rating=4) increases ease factor", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "LEARNING", repetitions: 1, interval: 1, ease: 2.3 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 4);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.ease).toBeCloseTo(2.45); // min(2.5, 2.3 + 0.15)
  });

  it("'good' (rating=3) slightly increases ease", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "LEARNING", repetitions: 1, interval: 1, ease: 2.4 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 3);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.ease).toBe(2.5); // min(2.5, 2.4 + 0.1)
  });

  it("'again' (rating=1) resets repetitions and interval", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "REVIEW", repetitions: 3, interval: 15, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 1);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.repetitions).toBe(0);
    expect(updateCall.data.interval).toBe(1);
    expect(updateCall.data.ease).toBeLessThan(2.5);
  });

  it("'hard' (rating=2, below threshold) applies partial penalty", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "REVIEW", repetitions: 3, interval: 10, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 2);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.repetitions).toBe(2); // max(0, 3-1)
    expect(updateCall.data.interval).toBe(5); // max(1, round(10*0.5))
    expect(updateCall.data.ease).toBeLessThan(2.5);
  });

  it("clamps ease factor to minimum 1.3", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "REVIEW", repetitions: 5, interval: 10, ease: 1.3 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 1);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.ease).toBeGreaterThanOrEqual(1.3);
  });

  it("clamps ease factor to maximum 2.5", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "LEARNING", repetitions: 1, interval: 1, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 4);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.ease).toBeLessThanOrEqual(2.5);
  });

  it("sets status to MASTERED when interval >= 21", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "REVIEW", repetitions: 3, interval: 18, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 4); // Easy rating pushes interval past 21
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    // interval = round(18 * 2.5) = 45, status should be MASTERED
    expect(updateCall.data.status).toBe("MASTERED");
  });

  it("sets status to LEARNING when repetitions >= 1 and interval < 7", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "NEW", repetitions: 0, interval: 1, ease: 2.5 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 3); // Good -> repetitions=1, interval=1
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.status).toBe("LEARNING");
  });

  it("clamps rating to valid range (1-4)", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "NEW", repetitions: 0, interval: 1, ease: 2.5, correctCount: 0 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    // Rating 10 should be clamped to 4 (correct = true)
    await reviewVocabWord(userId, wordId, 10);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.correctCount).toBe(1); // 0 + 1 (correct = clampedRating 4 >= 3)

    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ status: "NEW", repetitions: 0, interval: 1, ease: 2.5, correctCount: 0 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    // Rating -5 should be clamped to 1 (correct = false)
    await reviewVocabWord(userId, wordId, -5);
    const updateCall2 = vi.mocked(prisma.vocabProgress.update).mock.calls[1][0];
    expect(updateCall2.data.correctCount).toBe(0); // 0 + 0 (correct = clampedRating 1 >= 3 → false)
  });

  it("increments totalReviews on every review", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ totalReviews: 5, correctCount: 3 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 3);
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.totalReviews).toBe(6);
  });

  it("increments correctCount only for ratings >= 3", async () => {
    vi.mocked(prisma.vocabProgress.findUnique).mockResolvedValue(
      mockProgress({ totalReviews: 5, correctCount: 3 }) as never,
    );
    vi.mocked(prisma.vocabProgress.update).mockResolvedValue(mockProgress() as never);

    await reviewVocabWord(userId, wordId, 2); // Hard → correct = false
    const updateCall = vi.mocked(prisma.vocabProgress.update).mock.calls[0][0];
    expect(updateCall.data.correctCount).toBe(3); // unchanged
  });
});

// ── getVocabStats ─────────────────────────────────────────

describe("getVocabStats", () => {
  it("returns correct counts", async () => {
    vi.mocked(prisma.vocabWord.count).mockResolvedValue(120);
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([
      mockProgress({ status: "MASTERED", nextReview: new Date("2099-01-01") }),
      mockProgress({ id: 2, status: "LEARNING", nextReview: new Date("2099-01-01") }),
      mockProgress({ id: 3, status: "REVIEW", nextReview: new Date("2020-01-01") }),
    ] as never);

    const stats = await getVocabStats("usr_123");
    expect(stats.total).toBe(120);
    expect(stats.mastered).toBe(1);
    expect(stats.learning).toBe(1);
    expect(stats.due).toBe(1);
    expect(stats.reviewed).toBe(3);
  });

  it("returns zeros when no progress exists", async () => {
    vi.mocked(prisma.vocabWord.count).mockResolvedValue(120);
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);

    const stats = await getVocabStats("usr_123");
    expect(stats.total).toBe(120);
    expect(stats.mastered).toBe(0);
    expect(stats.learning).toBe(0);
    expect(stats.due).toBe(0);
    expect(stats.reviewed).toBe(0);
  });
});

// ── getVocabDailyProgress ─────────────────────────────────

describe("getVocabDailyProgress", () => {
  it("returns daily stats with streak", async () => {
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([
      mockProgress({ totalReviews: 5, correctCount: 4 }),
      mockProgress({ id: 2, totalReviews: 3, correctCount: 2 }),
    ] as never);
    vi.mocked(prisma.vocabProgress.count).mockResolvedValue(2);

    const result = await getVocabDailyProgress("usr_123");
    expect(result.wordsReviewed).toBe(2);
    expect(result.totalReviewsToday).toBe(8);
    expect(result.correctToday).toBe(6);
    expect(result.streak).toBeGreaterThanOrEqual(0);
  });

  it("returns zeros when no reviews today", async () => {
    vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.vocabProgress.count).mockResolvedValue(0);

    const result = await getVocabDailyProgress("usr_123");
    expect(result.wordsReviewed).toBe(0);
    expect(result.totalReviewsToday).toBe(0);
    expect(result.correctToday).toBe(0);
    expect(result.streak).toBe(0);
  });
});

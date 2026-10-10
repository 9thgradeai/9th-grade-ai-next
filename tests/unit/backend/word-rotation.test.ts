// @vitest-environment node
//
// Word rotation tests: vocab words circulate on 10-minute slots —
// the same slot deterministically yields the same word, and the DTO
// carries the slot boundary so clients can auto-rotate.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("~backend/db", () => ({
  prisma: {
    vocabWord: { findMany: vi.fn() },
    vocabProgress: { findMany: vi.fn() },
  },
}));

import { prisma } from "~backend/db";
import {
  getWordOfDay,
  getSlotIndex,
  getSlotEnd,
  WORD_SLOT_MS,
} from "~backend/services/word-of-the-day";

function mockWord(id: number, word: string) {
  return {
    id,
    word,
    bengaliMeaning: `অর্থ ${id}`,
    partOfSpeech: "Noun",
    exampleSentence: `Sentence ${id}.`,
    exampleSentenceBn: null,
    mnemonic: `Mnemonic ${id}.`,
    synonyms: [],
    antonyms: [],
    difficulty: "medium",
    examRelevance: ["BCS"],
    frequency: 50,
  };
}

const WORDS = Array.from({ length: 20 }, (_, i) => mockWord(i + 1, `Word${i + 1}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.vocabWord.findMany).mockResolvedValue(WORDS as never);
  vi.mocked(prisma.vocabProgress.findMany).mockResolvedValue([]);
});

describe("10-minute slot math", () => {
  it("aligns slots to 10-minute wall-clock boundaries", () => {
    expect(WORD_SLOT_MS).toBe(10 * 60 * 1000);
    const slot = getSlotIndex(new Date("2026-10-10T10:03:00.000Z"));
    expect(getSlotIndex(new Date("2026-10-10T10:09:59.999Z"))).toBe(slot);
    expect(getSlotIndex(new Date("2026-10-10T10:10:00.000Z"))).toBe(slot + 1);
  });

  it("ends each slot exactly on the next boundary", () => {
    const slot = getSlotIndex(new Date("2026-10-10T10:03:00.000Z"));
    expect(getSlotEnd(slot).toISOString()).toBe("2026-10-10T10:10:00.000Z");
  });
});

describe("getWordOfDay rotation", () => {
  it("is deterministic within a slot", async () => {
    const now = new Date("2026-10-10T10:03:00.000Z");
    const a = await getWordOfDay(undefined, now);
    const b = await getWordOfDay(undefined, new Date("2026-10-10T10:09:00.000Z"));
    expect(a.word).toBe(b.word);
    expect(a.slotIndex).toBe(b.slotIndex);
  });

  it("carries the slot boundary for client auto-rotation", async () => {
    const dto = await getWordOfDay(undefined, new Date("2026-10-10T10:03:00.000Z"));
    expect(dto.slotIndex).toBe(getSlotIndex(new Date("2026-10-10T10:03:00.000Z")));
    expect(dto.rotatesAt).toBe("2026-10-10T10:10:00.000Z");
  });

  it("moves to a different word in a later slot", async () => {
    const seen = new Set<string>();
    for (let s = 0; s < 20; s++) {
      const dto = await getWordOfDay(
        undefined,
        new Date(getSlotIndex(new Date("2026-10-10T00:00:00.000Z")) * WORD_SLOT_MS + s * WORD_SLOT_MS),
      );
      seen.add(dto.word);
    }
    // 20 consecutive slots over 20 words must circulate, not repeat one word.
    expect(seen.size).toBeGreaterThan(1);
  });
});

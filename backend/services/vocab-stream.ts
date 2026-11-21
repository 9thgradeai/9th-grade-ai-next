// backend/services/vocab-stream.ts — unified vocabulary stream.
//
// Phase 1 of the Vocabulary Enhancement Program: server-driven circulation.
//
// A single ordered stream that blends:
//   1. SRS-due words (weakest, first) from the user's vocabulary
//   2. Word-of-the-day (server-rotated 10-min slot)
//   3. Fresh words that haven't entered the stream yet
//
// The stream is consumed cursor-based (`cursor` = offset within a rotation
// window) so clients can advance without re-fetching the whole list, and it
// honours the 10-minute slot rotation for the daily word so "the book words
// circulate without the user rotating them."

import "server-only";
import { prisma } from "~backend/db";
import { getWordOfDay, type WordOfDayDTO } from "~backend/services/word-of-the-day";

export type VocabStreamMode = "due" | "daily" | "mixed" | "all";

export type VocabStreamWord = {
  id: number;
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  verbForms: string[] | null;
  synonyms: string[] | null;
  antonyms: string[] | null;
  exampleSentence: string;
  exampleSentenceBn: string | null;
  context: string;
  mnemonic: string;
  examRelevance: string[] | null;
  frequency: number;
  difficulty: string;
  ipa: string | null;
  audioUrl: string | null;
  register: string | null;
  collocations: string[] | null;
  wordFamily: string[] | null;
  confusables: string[] | null;
  status: string;
  source: "DUE" | "DAILY" | "FRESH";
};

export type VocabStreamResponse = {
  words: VocabStreamWord[];
  cursor: number;
  nextCursor: number | null;
  total: number;
  mode: VocabStreamMode;
  slotIndex: number;
  rotatesAt: string;
  wordOfDay: WordOfDayDTO | null;
};

const SLOT_MS = 10 * 60 * 1000;

export function getVocabSlotIndex(now: Date = new Date()): number {
  return Math.floor(now.getTime() / SLOT_MS);
}

export function getVocabSlotEnd(slotIndex: number): Date {
  return new Date((slotIndex + 1) * SLOT_MS);
}

function toStreamWord(
  w: {
    id: number;
    word: string;
    bengaliMeaning: string;
    partOfSpeech: string;
    verbForms: unknown;
    synonyms: unknown;
    antonyms: unknown;
    exampleSentence: string;
    exampleSentenceBn: string | null;
    context: string;
    mnemonic: string;
    examRelevance: unknown;
    frequency: number;
    difficulty: string;
    ipa?: string | null;
    audioUrl?: string | null;
    register?: string | null;
    collocations?: unknown;
    wordFamily?: unknown;
    confusables?: unknown;
  },
  status: string,
  source: "DUE" | "DAILY" | "FRESH",
): VocabStreamWord {
  return {
    id: w.id,
    word: w.word,
    bengaliMeaning: w.bengaliMeaning,
    partOfSpeech: w.partOfSpeech,
    verbForms: Array.isArray(w.verbForms) ? (w.verbForms as string[]) : null,
    synonyms: Array.isArray(w.synonyms) ? (w.synonyms as string[]) : null,
    antonyms: Array.isArray(w.antonyms) ? (w.antonyms as string[]) : null,
    exampleSentence: w.exampleSentence,
    exampleSentenceBn: w.exampleSentenceBn ?? null,
    context: w.context,
    mnemonic: w.mnemonic,
    examRelevance: Array.isArray(w.examRelevance) ? (w.examRelevance as string[]) : null,
    frequency: w.frequency,
    difficulty: w.difficulty,
    ipa: w.ipa ?? null,
    audioUrl: w.audioUrl ?? null,
    register: w.register ?? null,
    collocations: Array.isArray(w.collocations) ? (w.collocations as string[]) : null,
    wordFamily: Array.isArray(w.wordFamily) ? (w.wordFamily as string[]) : null,
    confusables: Array.isArray(w.confusables) ? (w.confusables as string[]) : null,
    status,
    source,
  };
}

/**
 * Build the unified vocabulary stream for a user.
 *
 * Modes:
 *  - "due"    : only words the user actually has to review right now.
 *  - "daily"  : the rotated daily word (slot-based) plus due words.
 *  - "mixed"  : due words first, then the daily word, then fresh words —
 *               the canonical blend for a learning session.
 *  - "all"    : every word the user has progress for, newest activity first.
 */
export async function getVocabStream(
  userId: string,
  opts: { mode?: VocabStreamMode; cursor?: number; limit?: number } = {},
): Promise<VocabStreamResponse> {
  const mode = opts.mode ?? "mixed";
  // Default to the whole corpus so the client can circulate every imported
  // word hands-free. Callers may request a smaller page via `limit`/`cursor`.
  const limit = Math.min(Math.max(opts.limit ?? 5000, 1), 5000);
  const cursor = Math.max(0, Math.floor(opts.cursor ?? 0));
  const slotIndex = getVocabSlotIndex();
  const slot = { slotIndex, rotatesAt: getVocabSlotEnd(slotIndex).toISOString() };
  // A single bounded corpus read powers both the Word of the Day picker and
  // the "fresh" portion of the stream. Every entry carries its real DB id so
  // reviews and notes work. Idioms/phrases stay out of the word stream.
  const allWords = await prisma.vocabWord.findMany({
    orderBy: { id: "asc" },
  });
  const wordOfDay = await getWordOfDay(userId, new Date(), allWords);
  const freshWords = allWords.filter((w) => !["Idiom", "Phrase"].includes(w.partOfSpeech));

  const dueProgresses = await prisma.vocabProgress.findMany({
    where: { userId, nextReview: { lte: new Date() } },
    include: { word: true },
    orderBy: { nextReview: "asc" },
  });

  const queue: VocabStreamWord[] = [];
  // Dedupe by real database id (ids are always > 0). The old `${source}:${word}`
  // key let the same word appear twice; an id-based key keeps one entry per word.
  const enqueued = new Set<number>();

  const enqueue = (w: VocabStreamWord) => {
    if (enqueued.has(w.id)) return;
    enqueued.add(w.id);
    queue.push(w);
  };

  if (mode === "due" || mode === "mixed") {
    for (const p of dueProgresses) {
      enqueue(toStreamWord(p.word, p.status, "DUE"));
    }
  }

  if (mode === "daily" || mode === "mixed") {
    // Resolve the Word of the Day to its actual VocabWord row so it has a
    // valid id (never the old id:-1 pseudo-word, which broke reviews/notes).
    const dailyRow =
      allWords.find((w) => w.word === wordOfDay.word) ??
      (await prisma.vocabWord.findUnique({ where: { word: wordOfDay.word } }));
    if (dailyRow) {
      enqueue(toStreamWord(dailyRow, wordOfDay.isCustom ? "CUSTOM" : "DAILY", "DAILY"));
    }
  }

  if (mode === "all") {
    const progresses = await prisma.vocabProgress.findMany({
      where: { userId },
      include: { word: true },
      orderBy: { updatedAt: "desc" },
    });
    for (const p of progresses) {
      enqueue(toStreamWord(p.word, p.status, "DUE"));
    }
  }

  // Fresh words: every remaining imported word enters the circulation.
  // Rotate the starting offset by the 10-minute slot so different slots lead
  // with different words, while the full set is always present in the queue.
  if (mode === "mixed" || mode === "all" || mode === "daily") {
    const start = freshWords.length > 0 ? slotIndex % freshWords.length : 0;
    for (let i = 0; i < freshWords.length; i++) {
      const w = freshWords[(start + i) % freshWords.length];
      enqueue(toStreamWord(w, "NEW", "FRESH"));
    }
  }

  const page = queue.slice(cursor, cursor + limit);
  const nextCursor = cursor + page.length < queue.length ? cursor + page.length : null;

  return {
    words: page,
    cursor,
    nextCursor,
    total: queue.length,
    mode,
    slotIndex,
    rotatesAt: slot.rotatesAt,
    wordOfDay: wordOfDay ?? null,
  };
}

import "server-only";
import { prisma } from "~backend/db";

export type WordOfDayDTO = {
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  exampleSentence: string;
  exampleSentenceBn: string | null;
  mnemonic: string;
  synonyms: string[];
  antonyms: string[];
  difficulty: string;
  examRelevance: string[];
  isCustom: boolean;
};

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function toDTO(word: {
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  exampleSentence: string;
  exampleSentenceBn: string | null;
  mnemonic: string;
  synonyms: unknown;
  antonyms: unknown;
  difficulty: string;
  examRelevance: unknown;
}): WordOfDayDTO {
  return {
    word: word.word,
    bengaliMeaning: word.bengaliMeaning,
    partOfSpeech: word.partOfSpeech,
    exampleSentence: word.exampleSentence,
    exampleSentenceBn: word.exampleSentenceBn ?? null,
    mnemonic: word.mnemonic,
    synonyms: Array.isArray(word.synonyms) ? (word.synonyms as string[]) : [],
    antonyms: Array.isArray(word.antonyms) ? (word.antonyms as string[]) : [],
    difficulty: word.difficulty,
    examRelevance: Array.isArray(word.examRelevance) ? (word.examRelevance as string[]) : [],
    isCustom: false,
  };
}

function buildCandidatePool(
  words: Awaited<ReturnType<typeof prisma.vocabWord.findMany>>,
  progressMap: Map<number, { status: string; repetitions: number }>,
): Array<{ word: (typeof words)[number]; score: number }> {
  return words.map((w) => {
    const prog = progressMap.get(w.id);
    let score = w.frequency;

    if (!prog) {
      score += 200; // unseen words get a big boost
    } else if (prog.status === "MASTERED") {
      score -= 150; // mastered words are deprioritized
    } else if (prog.status === "NEW") {
      score += 100;
    } else if (prog.status === "STRUGGLING") {
      score += 150; // struggling words should be revisited
    }

    return { word: w, score };
  });
}

function pickWordForDay(
  candidates: Array<{ word: { id: number; difficulty: string; partOfSpeech: string }; score: number }>,
  dayIndex: number,
  seenPartsOfSpeech: Set<string>,
): (typeof candidates)[number] {
  // Sort by score descending; for ties, use dayIndex as a tiebreaker for variety
  const sorted = [...candidates].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    // Vary by day so the same user doesn't always get the same tie result
    return (a.word.id + dayIndex) % 10 - (b.word.id + dayIndex) % 10;
  });

  // Prefer parts of speech we haven't used yet this week
  const preferred = sorted.find((c) => !seenPartsOfSpeech.has(c.word.partOfSpeech));
  if (preferred) return preferred;

  return sorted[0];
}

export async function getWordOfDay(userId?: string): Promise<WordOfDayDTO> {
  const today = new Date();
  const dayOfYear = getDayOfYear(today);

  const allWords = await prisma.vocabWord.findMany({
    orderBy: { id: "asc" },
  });

  if (allWords.length === 0) {
    throw new Error("No vocab words seeded in the database");
  }

  let progressMap = new Map<number, { status: string; repetitions: number }>();
  if (userId) {
    const progresses = await prisma.vocabProgress.findMany({
      where: { userId },
      select: { wordId: true, status: true, repetitions: true },
    });
    progressMap = new Map(progresses.map((p) => [p.wordId, p]));
  }

  const candidates = buildCandidatePool(allWords, progressMap);

  // Deterministic starting index for today, then skip mastered words
  const idx = dayOfYear % allWords.length;
  const seenPartsOfSpeech = new Set<string>();

  for (let attempt = 0; attempt < allWords.length; attempt++) {
    const candidateIdx = (idx + attempt) % allWords.length;
    const candidate = candidates[candidateIdx];
    const prog = progressMap.get(candidate.word.id);

    // Skip mastered words if user has alternatives
    if (prog?.status === "MASTERED" && attempt < allWords.length - 1) {
      continue;
    }

    // Prefer unseen/unmastered words
    if (!prog || prog.status === "MASTERED") {
      // Still acceptable if we've exhausted other options
      if (attempt >= allWords.length - 3) {
        return toDTO(candidate.word);
      }
      continue;
    }

    return toDTO(candidate.word);
  }

  // Fallback: return whatever the deterministic index landed on
  return toDTO(allWords[idx]);
}

export async function getWeeklyWords(userId?: string): Promise<WordOfDayDTO[]> {
  const today = new Date();
  const dayOfYear = getDayOfYear(today);

  const allWords = await prisma.vocabWord.findMany({
    orderBy: { id: "asc" },
  });

  if (allWords.length === 0) {
    throw new Error("No vocab words seeded in the database");
  }

  let progressMap = new Map<number, { status: string; repetitions: number }>();
  if (userId) {
    const progresses = await prisma.vocabProgress.findMany({
      where: { userId },
      select: { wordId: true, status: true, repetitions: true },
    });
    progressMap = new Map(progresses.map((p) => [p.wordId, p]));
  }

  const candidates = buildCandidatePool(allWords, progressMap);
  const usedIds = new Set<number>();
  const usedPartsOfSpeech = new Set<string>();
  const result: WordOfDayDTO[] = [];

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const adjustedDay = dayOfYear + dayOffset;
    const baseIdx = adjustedDay % allWords.length;

    // Filter out already-selected words
    const available = candidates.filter((c) => !usedIds.has(c.word.id));
    if (available.length === 0) break;

    // Rotate through available candidates starting from the base index
    const poolIdx = baseIdx % available.length;
    let best: (typeof available)[number] | null = null;

    // Search from poolIdx forward, then wrap, looking for best score + POS variety
    for (let i = 0; i < available.length; i++) {
      const candidate = available[(poolIdx + i) % available.length];
      const isNovel = !usedPartsOfSpeech.has(candidate.word.partOfSpeech);
      const score = candidate.score + (isNovel ? 50 : 0);

      if (!best || score > best.score || (score === best.score && isNovel)) {
        best = candidate;
        if (isNovel) break; // good enough, take it for variety
      }
    }

    if (best) {
      usedIds.add(best.word.id);
      usedPartsOfSpeech.add(best.word.partOfSpeech);
      result.push(toDTO(best.word));
    }
  }

  return result;
}

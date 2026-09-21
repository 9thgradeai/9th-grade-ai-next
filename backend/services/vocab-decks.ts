import "server-only";

import { prisma } from "~backend/db";

export type VocabDeckDTO = {
  id: number;
  name: string;
  nameBn: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  isDefault: boolean;
  isPublic: boolean;
  wordCount: number;
  masteredCount: number;
  isFavorited?: boolean;
};

export type VocabDeckWordDTO = {
  id: number;
  wordId: number;
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  difficulty: string;
  examRelevance: string[] | null;
  sortOrder: number;
  addedAt: string;
  progress?: {
    status: string;
    nextReview: string | null;
    interval: number;
    repetitions: number;
  } | null;
};

export async function getVocabDecks(userId?: string): Promise<VocabDeckDTO[]> {
  const where = { OR: [{ isPublic: true }, { isDefault: true }] };

  const decks = await prisma.vocabDeck.findMany({
    where,
    include: {
      words: {
        include: {
          word: {
            include: userId
              ? { progress: { where: { userId }, select: { status: true } } }
              : undefined,
          },
        },
      },
      userDecks: userId ? { where: { userId }, select: { isFavorite: true } } : false,
    },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return decks.map((deck) => {
    const masteredCount = deck.words.filter(
      (dw) => {
        const progress = (dw.word as typeof dw.word & { progress?: { status: string }[] }).progress;
        return progress?.[0]?.status === "MASTERED";
      },
    ).length;
    return {
      id: deck.id,
      name: deck.name,
      nameBn: deck.nameBn,
      description: deck.description,
      icon: deck.icon,
      color: deck.color,
      isDefault: deck.isDefault,
      isPublic: deck.isPublic,
      wordCount: deck.words.length,
      masteredCount,
      isFavorited: deck.userDecks?.[0]?.isFavorite ?? false,
    };
  });
}

export async function getVocabDeckWords(
  deckId: number,
  userId?: string,
): Promise<VocabDeckWordDTO[]> {
  const deckWords = await prisma.vocabDeckWord.findMany({
    where: { deckId },
    include: {
      word: {
        include: userId
          ? { progress: { where: { userId }, select: { status: true, nextReview: true, interval: true, repetitions: true } } }
          : undefined,
      },
    },
    orderBy: { sortOrder: "asc" },
  });

  return deckWords.map((dw) => {
    const w = dw.word as typeof dw.word & { progress?: { status: string; nextReview: Date | null; interval: number; repetitions: number }[] };
    return {
      id: dw.id,
      wordId: dw.wordId,
      word: w.word,
      bengaliMeaning: w.bengaliMeaning,
      partOfSpeech: w.partOfSpeech,
      difficulty: w.difficulty,
      examRelevance: w.examRelevance as string[] | null,
      sortOrder: dw.sortOrder,
      addedAt: dw.addedAt.toISOString(),
      progress: w.progress?.[0] ? {
        ...w.progress[0],
        nextReview: w.progress[0].nextReview ? w.progress[0].nextReview.toISOString() : null,
      } : null,
    };
  });
}

export async function createVocabDeck(
  userId: string,
  input: {
    name: string;
    nameBn?: string;
    description?: string;
    icon?: string;
    color?: string;
  },
): Promise<VocabDeckDTO> {
  const deck = await prisma.vocabDeck.create({
    data: {
      name: input.name,
      nameBn: input.nameBn ?? null,
      description: input.description ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      isPublic: false,
      creatorId: userId,
    },
  });

  return {
    id: deck.id,
    name: deck.name,
    nameBn: deck.nameBn,
    description: deck.description,
    icon: deck.icon,
    color: deck.color,
    isDefault: deck.isDefault,
    isPublic: deck.isPublic,
    wordCount: 0,
    masteredCount: 0,
  };
}

export async function addWordToDeck(
  deckId: number,
  wordId: number,
): Promise<void> {
  const maxSort = await prisma.vocabDeckWord.aggregate({
    where: { deckId },
    _max: { sortOrder: true },
  });

  await prisma.vocabDeckWord.create({
    data: {
      deckId,
      wordId,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function removeWordFromDeck(
  deckId: number,
  wordId: number,
): Promise<void> {
  await prisma.vocabDeckWord.deleteMany({
    where: { deckId, wordId },
  });
}

export async function toggleFavoriteDeck(
  userId: string,
  deckId: number,
): Promise<{ isFavorited: boolean }> {
  const existing = await prisma.userVocabDeck.findUnique({
    where: { userId_deckId: { userId, deckId } },
  });

  if (existing) {
    await prisma.userVocabDeck.update({
      where: { id: existing.id },
      data: { isFavorite: !existing.isFavorite },
    });
    return { isFavorited: !existing.isFavorite };
  }

  await prisma.userVocabDeck.create({
    data: { userId, deckId, isFavorite: true },
  });
  return { isFavorited: true };
}

export async function seedDefaultDecks(): Promise<void> {
  const existing = await prisma.vocabDeck.findFirst({ where: { isDefault: true } });
  if (existing) return;

  const words = await prisma.vocabWord.findMany();

  const deckDefs: Array<{
    name: string;
    nameBn: string;
    description: string;
    icon: string;
    color: string;
    filter: (w: (typeof words)[0]) => boolean;
  }> = [
    {
      name: "BCS Essentials",
      nameBn: "বিসিএস অপরিহার্য",
      description: "Core vocabulary for Bangladesh Civil Service examinations",
      icon: "🏛️",
      color: "#1E40AF",
      filter: (w) => {
        const rel = w.examRelevance as string[] | null;
        return rel?.includes("BCS") ?? false;
      },
    },
    {
      name: "Economy Words",
      nameBn: "অর্থনৈতিক পদ",
      description: "Economic and financial terminology for bank job exams",
      icon: "💰",
      color: "#059669",
      filter: (w) => {
        const rel = w.examRelevance as string[] | null;
        return rel?.includes("Bank") ?? false;
      },
    },
    {
      name: "Academic Vocabulary",
      nameBn: "একাডেমিক শব্দভান্ডার",
      description: "Academic and formal vocabulary for comprehensive preparation",
      icon: "📚",
      color: "#7C3AED",
      filter: (w) => w.difficulty === "HARD",
    },
    {
      name: "Idioms & Phrases",
      nameBn: "বাগধারা ও বাক্যাংশ",
      description: "Common idioms and phrases tested in competitive exams",
      icon: "💬",
      color: "#DC2626",
      filter: (w) => w.partOfSpeech === "Idiom",
    },
    {
      name: "Hard Words",
      nameBn: "কঠিন শব্দ",
      description: "Challenging words that require extra practice",
      icon: "🔥",
      color: "#EA580C",
      filter: (w) => w.difficulty === "HARD" || w.difficulty === "MEDIUM",
    },
  ];

  for (const def of deckDefs) {
    const matching = words.filter(def.filter);
    if (matching.length === 0) continue;

    const deck = await prisma.vocabDeck.create({
      data: {
        name: def.name,
        nameBn: def.nameBn,
        description: def.description,
        icon: def.icon,
        color: def.color,
        isDefault: true,
        isPublic: true,
      },
    });

    await prisma.vocabDeckWord.createMany({
      data: matching.map((w, i) => ({
        deckId: deck.id,
        wordId: w.id,
        sortOrder: i,
      })),
    });
  }
}

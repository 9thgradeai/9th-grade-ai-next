// backend/services/vocab.ts — Vocabulary learning with SM-2 spaced repetition.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import { prisma } from "~backend/db";
import { VOCAB_SEED_DATA } from "~backend/../database/data/vocab-seed";

export type VocabWordDTO = {
  id: number;
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  verbForms: string[] | null;
  synonyms: string[] | null;
  antonyms: string[] | null;
  exampleSentence: string;
  exampleSentenceBn?: string | null;
  context: string;
  mnemonic: string;
  examRelevance: string[] | null;
  frequency: number;
  difficulty: string;
  progress?: {
    status: string;
    nextReview: string | null;
    interval: number;
    repetitions: number;
    totalReviews: number;
    correctCount: number;
  } | null;
};

// Original 10 seed words (kept for backward compatibility)
const ORIGINAL_SEED_WORDS: Omit<VocabWordDTO, "id">[] = [
  {
    word: "Abandon",
    bengaliMeaning: "পরিত্যাগ করা",
    partOfSpeech: "Verb",
    verbForms: ["abandon", "abandoned", "abandoning", "abandonment"],
    synonyms: ["desert", "forsake", "leave"],
    antonyms: ["retain", "keep", "maintain"],
    exampleSentence: "The government decided to abandon the outdated policy after mass protests.",
    exampleSentenceBn: "গণবিক্ষোভের পর সরকার সেকেলে নীতিটি পরিত্যাগ করার সিদ্ধান্ত নেয়।",
    context: "Used for policies, plans, or places left completely — common in BCS comprehension and Bank précis.",
    mnemonic: "Ab + abandon = 'a band' leaves the stage — imagine a band abandoning the stage.",
    examRelevance: ["BCS", "Bank", "9th Grade"],
    frequency: 95,
    difficulty: "EASY",
  },
  {
    word: "Benevolent",
    bengaliMeaning: "পরোপকারী, দয়ালু",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["kind", "generous", "compassionate"],
    antonyms: ["malevolent", "cruel", "selfish"],
    exampleSentence: "The benevolent officer helped the flood victims without any publicity.",
    context: "Describes people/institutions showing goodwill — frequent in BCS ethics and synonyms section.",
    mnemonic: "Bene = good (like benefit) + volent = wishing — wishing good for others.",
    examRelevance: ["BCS", "Bank"],
    frequency: 88,
    difficulty: "MEDIUM",
  },
  {
    word: "Ephemeral",
    bengaliMeaning: "ক্ষণস্থায়ী",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["transient", "fleeting", "momentary"],
    antonyms: ["permanent", "eternal", "lasting"],
    exampleSentence: "Social media fame is often ephemeral, unlike true knowledge.",
    context: "Academic/editorial vocabulary — tested in BCS synonyms/antonyms and Bank RC.",
    mnemonic: "E + phemeral = 'a femur' is ephemeral? No — short-lived like a mayfly (ephemeroptera).",
    examRelevance: ["BCS", "Bank"],
    frequency: 75,
    difficulty: "HARD",
  },
  {
    word: "Mitigate",
    bengaliMeaning: "প্রশমিত করা, লাঘব করা",
    partOfSpeech: "Verb",
    verbForms: ["mitigate", "mitigated", "mitigating", "mitigation"],
    synonyms: ["alleviate", "reduce", "lessen"],
    antonyms: ["aggravate", "intensify", "worsen"],
    exampleSentence: "Afforestation can mitigate the effects of climate change in Bangladesh.",
    context: "Key for environment/disaster topics — BCS written and viva.",
    mnemonic: "Mitigate = 'mite' + gate — a tiny gate that lessens the flood.",
    examRelevance: ["BCS", "9th Grade"],
    frequency: 82,
    difficulty: "MEDIUM",
  },
  {
    word: "Pragmatic",
    bengaliMeaning: "বাস্তববাদী",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["practical", "realistic", "sensible"],
    antonyms: ["idealistic", "impractical", "utopian"],
    exampleSentence: "A pragmatic approach to traffic management is needed in Dhaka.",
    context: "Governance/ethics vocabulary — BCS good-governance questions.",
    mnemonic: "Pragmatic = practical + magic — magic that actually works in practice.",
    examRelevance: ["BCS"],
    frequency: 80,
    difficulty: "MEDIUM",
  },
  {
    word: "Ubiquitous",
    bengaliMeaning: "সর্বব্যাপী",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["omnipresent", "pervasive", "universal"],
    antonyms: ["rare", "scarce", "absent"],
    exampleSentence: "Mobile phones are now ubiquitous even in remote villages.",
    context: "Tech/ICT and social change passages — Bank and BCS.",
    mnemonic: "Ubi = everywhere (like Uber) + quitous — everywhere at once.",
    examRelevance: ["BCS", "Bank"],
    frequency: 77,
    difficulty: "MEDIUM",
  },
  {
    word: "Alleviate",
    bengaliMeaning: "উপশম করা",
    partOfSpeech: "Verb",
    verbForms: ["alleviate", "alleviated", "alleviating", "alleviation"],
    synonyms: ["relieve", "ease", "mitigate"],
    antonyms: ["aggravate", "worsen"],
    exampleSentence: "Microcredit helps alleviate poverty in rural areas.",
    context: "Poverty/economy — BCS Bangladesh affairs.",
    mnemonic: "Alleviate = a + levitate — lifting pain away, levitating it.",
    examRelevance: ["BCS", "Bank"],
    frequency: 85,
    difficulty: "MEDIUM",
  },
  {
    word: "Diligent",
    bengaliMeaning: "পরিশ্রমী",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["hardworking", "industrious", "assiduous"],
    antonyms: ["lazy", "negligent", "idle"],
    exampleSentence: "A diligent student revises vocabulary daily with spaced repetition.",
    context: "Character trait — BCS ethics and Bank HR passages.",
    mnemonic: "Diligent = 'diligence' — imagine a diligent ant working non-stop.",
    examRelevance: ["BCS", "9th Grade"],
    frequency: 90,
    difficulty: "EASY",
  },
  {
    word: "Ambiguous",
    bengaliMeaning: "দ্ব্যর্থক, অস্পষ্ট",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["vague", "unclear", "equivocal"],
    antonyms: ["clear", "unambiguous", "explicit"],
    exampleSentence: "The ambiguous circular created confusion among the candidates.",
    context: "Administrative language — BCS circular comprehension.",
    mnemonic: "Ambi = both (like ambiguous — both meanings) + guous — unclear both ways.",
    examRelevance: ["BCS", "Bank"],
    frequency: 78,
    difficulty: "MEDIUM",
  },
  {
    word: "Resilient",
    bengaliMeaning: "স্থিতিস্থাপক, সহনশীল",
    partOfSpeech: "Adjective",
    verbForms: null,
    synonyms: ["tough", "adaptable", "hardy"],
    antonyms: ["fragile", "vulnerable", "weak"],
    exampleSentence: "Bangladeshi farmers are resilient despite recurring floods.",
    context: "Disaster management — BCS geography/environment.",
    mnemonic: "Resilient = re + salient — bounce back saliently after pressure.",
    examRelevance: ["BCS", "9th Grade"],
    frequency: 83,
    difficulty: "MEDIUM",
  },
];

export async function seedVocabWords() {
  let count = 0;
  // Seed original 10 words
  for (const w of ORIGINAL_SEED_WORDS) {
    await prisma.vocabWord.upsert({
      where: { word: w.word },
      update: {
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn ?? undefined,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
      create: {
        word: w.word,
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn ?? undefined,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
    });
    count++;
  }
  // Seed expanded vocabulary (135 words)
  for (const w of VOCAB_SEED_DATA) {
    await prisma.vocabWord.upsert({
      where: { word: w.word },
      update: {
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
      create: {
        word: w.word,
        bengaliMeaning: w.bengaliMeaning,
        partOfSpeech: w.partOfSpeech,
        verbForms: w.verbForms ?? undefined,
        synonyms: w.synonyms ?? undefined,
        antonyms: w.antonyms ?? undefined,
        exampleSentence: w.exampleSentence,
        exampleSentenceBn: w.exampleSentenceBn,
        context: w.context,
        mnemonic: w.mnemonic,
        examRelevance: w.examRelevance ?? undefined,
        frequency: w.frequency,
        difficulty: w.difficulty,
      },
    });
    count++;
  }
  return count;
}

export async function getVocabWords(
  userId?: string,
  opts?: { limit?: number; exam?: string; difficulty?: string; search?: string; due?: string; status?: string },
) {
  const limit = Math.min(opts?.limit ?? 20, 100);

  // DB-level difficulty filter
  const where: Record<string, unknown> = {};
  if (opts?.difficulty && opts.difficulty.toUpperCase() !== "ALL") {
    where.difficulty = opts.difficulty.toUpperCase();
  }

  const words = await prisma.vocabWord.findMany({
    orderBy: [{ frequency: "desc" }, { word: "asc" }],
    take: 200,
    where,
  });

  let filtered = words;

  // In-memory exam filter (JSON column)
  if (opts?.exam && opts.exam.toUpperCase() !== "ALL") {
    filtered = filtered.filter((w) => {
      const rel = w.examRelevance as string[] | null;
      return !rel || rel.includes(opts.exam!);
    });
  }

  // Text search filter (client-side via API param)
  if (opts?.search && opts.search.trim()) {
    const q = opts.search.trim().toLowerCase();
    filtered = filtered.filter((w) =>
      w.word.toLowerCase().includes(q) ||
      w.bengaliMeaning.toLowerCase().includes(q) ||
      w.partOfSpeech.toLowerCase().includes(q)
    );
  }

  // Personalize: prioritize due reviews and weaknesses
  if (userId) {
    const progresses = await prisma.vocabProgress.findMany({ where: { userId } });
    const progMap = new Map(progresses.map((p) => [p.wordId, p]));
    const now = Date.now();

    // Apply status filter (post-personalization)
    if (opts?.status && opts.status.toUpperCase() !== "ALL") {
      const statusFilter = opts.status.toUpperCase();
      filtered = filtered.filter((w) => {
        const p = progMap.get(w.id);
        if (statusFilter === "NEW") return !p || p.status === "NEW";
        if (statusFilter === "DUE") return p?.nextReview && new Date(p.nextReview).getTime() <= now;
        return p?.status === statusFilter;
      });
    }

    // Apply due-only filter
    if (opts?.due === "true") {
      filtered = filtered.filter((w) => {
        const p = progMap.get(w.id);
        return p?.nextReview && new Date(p.nextReview).getTime() <= now;
      });
    }

    filtered = filtered.sort((a, b) => {
      const pa = progMap.get(a.id);
      const pb = progMap.get(b.id);
      const score = (w: typeof a, p?: typeof pa) => {
        if (!p) return w.frequency + 50;
        if (p.status === "LEARNING") return 1000;
        if (p.nextReview && new Date(p.nextReview).getTime() <= now) return 900;
        if (p.status === "NEW") return 500;
        return 100 - p.interval;
      };
      return score(b, pb) - score(a, pa);
    });
  }

  const sliced = filtered.slice(0, limit);
  if (!userId) return sliced.map((w) => toDTO(w));

  const userProgresses = await prisma.vocabProgress.findMany({
    where: { userId, wordId: { in: sliced.map((w) => w.id) } },
  });
  const progMap = new Map(userProgresses.map((p) => [p.wordId, p]));
  return sliced.map((w) => toDTO(w, progMap.get(w.id)));
}

function toDTO(w: {
  id: number; word: string; bengaliMeaning: string; partOfSpeech: string; verbForms: unknown; synonyms: unknown; antonyms: unknown;
  exampleSentence: string; exampleSentenceBn: string | null; context: string; mnemonic: string; examRelevance: unknown; frequency: number; difficulty: string;
}, progress?: { status: string; nextReview: Date | null; interval: number; repetitions: number; totalReviews: number; correctCount: number } | null): VocabWordDTO {
  return {
    id: w.id,
    word: w.word,
    bengaliMeaning: w.bengaliMeaning,
    partOfSpeech: w.partOfSpeech,
    verbForms: (w.verbForms as string[] | null) ?? null,
    synonyms: (w.synonyms as string[] | null) ?? null,
    antonyms: (w.antonyms as string[] | null) ?? null,
    exampleSentence: w.exampleSentence,
    exampleSentenceBn: w.exampleSentenceBn,
    context: w.context,
    mnemonic: w.mnemonic,
    examRelevance: (w.examRelevance as string[] | null) ?? null,
    frequency: w.frequency,
    difficulty: w.difficulty,
    progress: progress ? {
      status: progress.status,
      nextReview: progress.nextReview ? progress.nextReview.toISOString() : null,
      interval: progress.interval,
      repetitions: progress.repetitions,
      totalReviews: progress.totalReviews,
      correctCount: progress.correctCount,
    } : null,
  };
}

/**
 * Record a vocabulary review with SM-2 spaced repetition.
 * @param rating 1=Again, 2=Hard, 3=Good, 4=Easy
 */
export async function reviewVocabWord(userId: string, wordId: number, rating: number) {
  const clampedRating = Math.max(1, Math.min(4, Math.round(rating)));
  const correct = clampedRating >= 3;

  const word = await prisma.vocabWord.findUnique({ where: { id: wordId } });
  if (!word) throw new Error("Word not found");
  let progress = await prisma.vocabProgress.findUnique({ where: { userId_wordId: { userId, wordId } } });
  const now = new Date();
  if (!progress) {
    progress = await prisma.vocabProgress.create({ data: { userId, wordId, status: "NEW", nextReview: now } });
  }

  // SM-2 with 4-grade rating
  let { ease, interval, repetitions, totalReviews, correctCount } = progress;
  totalReviews += 1;

  if (correct) {
    correctCount += 1;
    // Quality factor: Again=0, Hard=2, Good=3, Easy=4 (standard SM-2 scale mapped)
    const q = clampedRating === 3 ? 3 : clampedRating === 4 ? 4 : 2;

    if (progress.status === "NEW" || progress.status === "LEARNING") {
      repetitions += 1;
      if (repetitions === 1) {
        interval = 1;
      } else if (repetitions === 2) {
        interval = q >= 4 ? 10 : 6;
      } else {
        interval = Math.round(interval * ease);
      }
    } else {
      repetitions += 1;
      interval = Math.round(interval * ease);
    }

    // Ease adjustment based on rating
    if (q >= 4) ease = Math.min(2.5, ease + 0.15);
    else if (q === 3) ease = Math.min(2.5, ease + 0.1);
    else ease = Math.max(1.3, ease - 0.05);
  } else {
    // Again (rating=1) or Hard (rating=2) when below threshold
    if (clampedRating === 1) {
      // Full reset for "Again"
      repetitions = 0;
      interval = 1;
      ease = Math.max(1.3, ease - 0.2);
    } else {
      // Hard: partial penalty
      repetitions = Math.max(0, repetitions - 1);
      interval = Math.max(1, Math.round(interval * 0.5));
      ease = Math.max(1.3, ease - 0.1);
    }
  }

  const status = interval >= 21 ? "MASTERED" : interval >= 7 ? "REVIEW" : repetitions >= 1 ? "LEARNING" : "NEW";
  const nextReview = new Date(now.getTime() + interval * 24 * 60 * 60 * 1000);

  const updated = await prisma.vocabProgress.update({
    where: { userId_wordId: { userId, wordId } },
    data: { status, ease, interval, repetitions, nextReview, lastReviewedAt: now, totalReviews, correctCount },
  });
  return { progress: updated, word };
}

export async function getVocabStats(userId: string) {
  const total = await prisma.vocabWord.count();
  const progresses = await prisma.vocabProgress.findMany({ where: { userId } });
  const mastered = progresses.filter((p) => p.status === "MASTERED").length;
  const learning = progresses.filter((p) => p.status === "LEARNING").length;
  const due = progresses.filter((p) => p.nextReview && new Date(p.nextReview) <= new Date()).length;
  return { total, mastered, learning, due, reviewed: progresses.length };
}

export async function getVocabDailyProgress(userId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayReviews = await prisma.vocabProgress.findMany({
    where: { userId, lastReviewedAt: { gte: today } },
    select: { wordId: true, correctCount: true, totalReviews: true },
  });
  const wordsReviewed = todayReviews.length;
  const totalReviewsToday = todayReviews.reduce((sum, p) => sum + p.totalReviews, 0);
  const correctToday = todayReviews.reduce((sum, p) => sum + p.correctCount, 0);
  const streak = await computeStreak(userId);
  return { wordsReviewed, totalReviewsToday, correctToday, streak };
}

async function computeStreak(userId: string) {
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const dayStart = new Date(d);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const count = await prisma.vocabProgress.count({
      where: { userId, lastReviewedAt: { gte: dayStart, lt: dayEnd } },
    });
    if (count === 0) break;
    streak++;
  }
  return streak;
}

export async function getVocabQuizWords(userId: string, opts?: { count?: number; difficulty?: string }) {
  const count = Math.min(opts?.count ?? 10, 50);
  const where: Record<string, unknown> = {};
  if (opts?.difficulty && opts.difficulty.toUpperCase() !== "ALL") {
    where.difficulty = opts.difficulty.toUpperCase();
  }
  const words = await prisma.vocabWord.findMany({
    orderBy: { frequency: "desc" },
    take: 200,
    where,
  });
  if (words.length < 4) return [];
  // Pick random words for quiz, prioritize weak/never-seen words
  let pool = words;
  if (userId) {
    const progresses = await prisma.vocabProgress.findMany({ where: { userId } });
    const progMap = new Map(progresses.map((p) => [p.wordId, p]));
    pool = [...words].sort((a, b) => {
      const pa = progMap.get(a.id);
      const pb = progMap.get(b.id);
      const score = (w: typeof a, p?: typeof pa) => {
        if (!p) return 3;
        if (p.status === "LEARNING") return 0;
        if (p.totalReviews > 0 && p.correctCount / p.totalReviews < 0.6) return 1;
        return 2;
      };
      return score(a, pa) - score(b, pb);
    });
  }
  // Shuffle and pick
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, count);
  // For each word, pick 3 distractors from the pool
  return shuffled.map((w) => {
    const distractors = pool
      .filter((x) => x.id !== w.id && x.partOfSpeech === w.partOfSpeech)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((x) => ({ id: x.id, word: x.word, bengaliMeaning: x.bengaliMeaning }));
    // If not enough same-POS distractors, fill with any
    if (distractors.length < 3) {
      const extra = pool
        .filter((x) => x.id !== w.id && !distractors.some((d) => d.id === x.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, 3 - distractors.length)
        .map((x) => ({ id: x.id, word: x.word, bengaliMeaning: x.bengaliMeaning }));
      distractors.push(...extra);
    }
    return {
      id: w.id,
      word: w.word,
      bengaliMeaning: w.bengaliMeaning,
      partOfSpeech: w.partOfSpeech,
      exampleSentence: w.exampleSentence,
      distractors,
    };
  });
}

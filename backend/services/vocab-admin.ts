import "server-only";

import { prisma } from "~backend/db";
import { AppError, NotFoundError, ConflictError, InternalServerError } from "~backend/errors";

export type CreateVocabWordInput = {
  word: string;
  bengaliMeaning: string;
  partOfSpeech: string;
  verbForms?: string[];
  synonyms?: string[];
  antonyms?: string[];
  exampleSentence: string;
  exampleSentenceBn?: string;
  context: string;
  mnemonic: string;
  examRelevance?: string[];
  frequency?: number;
  difficulty?: string;
};

export type UpdateVocabWordInput = Partial<CreateVocabWordInput>;

export async function listVocabWords(opts?: {
  page?: number;
  limit?: number;
  search?: string;
  difficulty?: string;
}) {
  try {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));
    const skip = (page - 1) * limit;
    const search = opts?.search ?? "";
    const difficulty = opts?.difficulty;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { word: { contains: search, mode: "insensitive" } },
        { bengaliMeaning: { contains: search, mode: "insensitive" } },
        { partOfSpeech: { contains: search, mode: "insensitive" } },
      ];
    }
    if (difficulty) {
      where.difficulty = difficulty;
    }

    const [words, total] = await Promise.all([
      prisma.vocabWord.findMany({
        where,
        skip,
        take: limit,
        orderBy: { word: "asc" },
      }),
      prisma.vocabWord.count({ where }),
    ]);

    return { words, total, page, pages: Math.ceil(total / limit) };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to list vocabulary words");
  }
}

export async function getVocabWord(id: number) {
  try {
    const word = await prisma.vocabWord.findUnique({
      where: { id },
      include: {
        progress: {
          select: { userId: true },
        },
        _count: { select: { progress: true } },
      },
    });

    if (!word) throw new NotFoundError("Vocabulary word not found");
    return word;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to get vocabulary word");
  }
}

export async function createVocabWord(input: CreateVocabWordInput) {
  try {
    const existing = await prisma.vocabWord.findUnique({
      where: { word: input.word },
    });
    if (existing) {
      throw new ConflictError(`Word "${input.word}" already exists`);
    }

    const word = await prisma.vocabWord.create({
      data: {
        word: input.word,
        bengaliMeaning: input.bengaliMeaning,
        partOfSpeech: input.partOfSpeech,
        verbForms: input.verbForms ?? undefined,
        synonyms: input.synonyms ?? undefined,
        antonyms: input.antonyms ?? undefined,
        exampleSentence: input.exampleSentence,
        exampleSentenceBn: input.exampleSentenceBn ?? undefined,
        context: input.context,
        mnemonic: input.mnemonic,
        examRelevance: input.examRelevance ?? undefined,
        frequency: input.frequency ?? 0,
        difficulty: input.difficulty ?? "MEDIUM",
      },
    });

    return word;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to create vocabulary word");
  }
}

export async function updateVocabWord(id: number, input: UpdateVocabWordInput) {
  try {
    const existing = await prisma.vocabWord.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Vocabulary word not found");

    if (input.word && input.word !== existing.word) {
      const duplicate = await prisma.vocabWord.findUnique({
        where: { word: input.word },
      });
      if (duplicate) {
        throw new ConflictError(`Word "${input.word}" already exists`);
      }
    }

    const word = await prisma.vocabWord.update({
      where: { id },
      data: {
        ...(input.word !== undefined && { word: input.word }),
        ...(input.bengaliMeaning !== undefined && { bengaliMeaning: input.bengaliMeaning }),
        ...(input.partOfSpeech !== undefined && { partOfSpeech: input.partOfSpeech }),
        ...(input.verbForms !== undefined && { verbForms: input.verbForms }),
        ...(input.synonyms !== undefined && { synonyms: input.synonyms }),
        ...(input.antonyms !== undefined && { antonyms: input.antonyms }),
        ...(input.exampleSentence !== undefined && { exampleSentence: input.exampleSentence }),
        ...(input.exampleSentenceBn !== undefined && { exampleSentenceBn: input.exampleSentenceBn }),
        ...(input.context !== undefined && { context: input.context }),
        ...(input.mnemonic !== undefined && { mnemonic: input.mnemonic }),
        ...(input.examRelevance !== undefined && { examRelevance: input.examRelevance }),
        ...(input.frequency !== undefined && { frequency: input.frequency }),
        ...(input.difficulty !== undefined && { difficulty: input.difficulty }),
      },
    });

    return word;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to update vocabulary word");
  }
}

export async function deleteVocabWord(id: number) {
  try {
    const existing = await prisma.vocabWord.findUnique({
      where: { id },
      include: { _count: { select: { progress: true } } },
    });
    if (!existing) throw new NotFoundError("Vocabulary word not found");

    if (existing._count.progress > 0) {
      await prisma.vocabProgress.deleteMany({ where: { wordId: id } });
    }

    await prisma.vocabWord.delete({ where: { id } });
    return { deleted: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to delete vocabulary word");
  }
}

export async function getVocabStats() {
  try {
    const [totalWords, totalProgress, byDifficulty, byPOS] = await Promise.all([
      prisma.vocabWord.count(),
      prisma.vocabProgress.count(),
      prisma.vocabWord.groupBy({
        by: ["difficulty"],
        _count: { id: true },
      }),
      prisma.vocabWord.groupBy({
        by: ["partOfSpeech"],
        _count: { id: true },
      }),
    ]);

    return {
      totalWords,
      totalProgress,
      byDifficulty: byDifficulty.map((d) => ({
        difficulty: d.difficulty,
        count: d._count.id,
      })),
      byPOS: byPOS.map((p) => ({
        partOfSpeech: p.partOfSpeech,
        count: p._count.id,
      })),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to get vocabulary stats");
  }
}

import { PrismaClient } from "@prisma/client";
import { FLASHCARD_LIBRARY } from "../database/data/flashcard-library";
import { sourceKey } from "./seed-keys";

const prisma = new PrismaClient();

async function main() {
  const keys: string[] = [];
  for (const c of FLASHCARD_LIBRARY) {
    const key = sourceKey(c.subject, c.question);
    keys.push(key);
    const data = {
      subjectId: null,
      subjectName: c.subject,
      answer: c.answer,
      hint: c.hint ?? "",
      difficulty: c.difficulty.toUpperCase() as "EASY" | "MEDIUM" | "HARD",
      examRelevance: c.examRelevance,
      nextReview: new Date(Date.now() + 86400000),
    };
    await prisma.flashcard.upsert({
      where: { sourceKey: key },
      update: data,
      create: { question: c.question, sourceKey: key, ...data },
    });
  }
  const stale = await prisma.flashcard.deleteMany({ where: { sourceKey: { notIn: keys } } });
  const total = await prisma.flashcard.count();
  console.log(`upserted=${keys.length} stale-removed=${stale.count} total=${total}`);
}

main().finally(() => prisma.$disconnect());

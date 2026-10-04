import { PrismaClient } from "@prisma/client";
import { seedVocabWords } from "../backend/services/vocab-seed-run";
const prisma = new PrismaClient();
async function main() {
  const n = await seedVocabWords(prisma);
  const total = await prisma.vocabWord.count();
  console.log(`seeded-upserted=${n} total-vocab-words=${total}`);
  const sample = await prisma.vocabWord.findMany({
    where: { word: { in: ["Adept", "Cacophonous", "Sanguine", "Random"] } },
    select: { word: true, bengaliMeaning: true, antonyms: true },
  });
  console.log(JSON.stringify(sample));
}
main().finally(() => prisma.$disconnect());

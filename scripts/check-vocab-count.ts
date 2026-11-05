import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.vocabWord.count();
  console.log("Total VocabWord count:", count);
  await prisma.$disconnect();
}

main().catch(console.error);
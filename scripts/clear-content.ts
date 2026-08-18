/**
 * scripts/clear-content.ts
 * ----------------------------------------------------------------------------
 * Empties the seed-managed content tables (Question, then Topic) so that
 * `prisma db push` can apply schema changes that require empty tables (e.g.
 * adding required columns or unique constraints on Topic.path).
 *
 * Only content rows are removed — users, sessions, progress, and other
 * user-generated data are untouched. The deletes run sequentially because the
 * Topic self-relation cascade can deadlock when run in parallel.
 *
 * Run as part of `npm run db:sync`:
 *   npx tsx scripts/clear-content.ts
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const delQ = await prisma.question.deleteMany({});
  const delT = await prisma.topic.deleteMany({});
  if (delQ.count > 0 || delT.count > 0) {
    console.log(`Cleared ${delQ.count} questions, ${delT.count} topics`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
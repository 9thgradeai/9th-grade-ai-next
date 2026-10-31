/**
 * scripts/cleanup-bank-financial-subjects.ts
 * ----------------------------------------------------------------------------
 * One-off, idempotent cleanup for the Bangladesh Bank ecosystem:
 *
 *   1. Deletes the two legacy, topic-less Financial subjects created by the
 *      early `import-financial-banking-*.ts` importers
 *      (`আর্থিক ও ব্যাংকিং জ্ঞান` and `আর্থিক জ্ঞান`). They carry the same 840
 *      questions twice and show "0 questions" in Practice because they have no
 *      Topic tree. Deletion cascades to those questions. Rows that carry any
 *      user data (bookmark / attempt / progress) are skipped, never deleted.
 *
 *   2. Renames the canonical `06_Financial_Knowledge` subject's display label to
 *      `06_Financial & Banking Knowledge`. Its topic paths stay rooted at
 *      `06_Financial_Knowledge` (the architecture segment is unchanged).
 *
 * Run with: npx tsx scripts/cleanup-bank-financial-subjects.ts
 * Uses DATABASE_URL from the environment.
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";

const LEGACY_SUBJECTS = ["আর্থিক ও ব্যাংকিং জ্ঞান", "আর্থিক জ্ঞান"];
const CANONICAL_OLD_NAME = "06_Financial_Knowledge";
const CANONICAL_NEW_NAME_BN = "06_Financial & Banking Knowledge";
const CANONICAL_NEW_NAME_EN = "Financial & Banking Knowledge";

export async function cleanupBankFinancialSubjects(prisma: PrismaClient): Promise<void> {
  const bank = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bank) {
    console.log("BANGLADESH_BANK ecosystem not found — nothing to do.");
    return;
  }

  // 1. Remove the legacy duplicate subjects (guarded by user-data checks).
  const legacy = await prisma.subject.findMany({
    where: { ecosystemId: bank.id, nameBn: { in: LEGACY_SUBJECTS } },
    select: { id: true, nameBn: true },
  });
  if (legacy.length === 0) {
    console.log("No legacy Financial subjects found.");
  }
  for (const subject of legacy) {
    const questions = await prisma.question.findMany({ where: { subjectId: subject.id }, select: { id: true } });
    const questionIds = questions.map((q) => q.id);
    const [bookmarks, attempts, progress, flashcards, categories, conversations] = await Promise.all([
      prisma.bookmark.count({ where: { questionId: { in: questionIds } } }),
      prisma.questionAttempt.count({ where: { questionId: { in: questionIds } } }),
      prisma.userQuestionProgress.count({ where: { questionId: { in: questionIds } } }),
      prisma.flashcard.count({ where: { subjectId: subject.id } }),
      prisma.questionBankCategory.count({ where: { subjectId: subject.id } }),
      prisma.aIConversation.count({ where: { subjectId: subject.id } }),
    ]);
    const userData = bookmarks + attempts + progress + flashcards + categories + conversations;
    if (userData > 0) {
      console.log(
        `⚠ Skipped "${subject.nameBn}" (id=${subject.id}): carries ${userData} user-data row(s). Resolve manually.`,
      );
      continue;
    }
    await prisma.subject.delete({ where: { id: subject.id } });
    console.log(`✓ Deleted legacy subject "${subject.nameBn}" (id=${subject.id}, ${questionIds.length} questions)`);
  }

  // 2. Rename the canonical subject's display label (paths stay 06_*).
  const canonical = await prisma.subject.findFirst({
    where: { ecosystemId: bank.id, nameBn: { in: [CANONICAL_OLD_NAME, CANONICAL_NEW_NAME_BN] } },
    select: { id: true, nameBn: true, nameEn: true },
  });
  if (!canonical) {
    console.log(`⚠ Canonical subject "${CANONICAL_OLD_NAME}" not found — rename skipped.`);
    return;
  }
  if (canonical.nameBn === CANONICAL_NEW_NAME_BN && canonical.nameEn === CANONICAL_NEW_NAME_EN) {
    console.log(`Canonical subject (id=${canonical.id}) already named "${CANONICAL_NEW_NAME_BN}".`);
    return;
  }
  await prisma.subject.update({
    where: { id: canonical.id },
    data: { nameBn: CANONICAL_NEW_NAME_BN, nameEn: CANONICAL_NEW_NAME_EN },
  });
  console.log(
    `✓ Renamed subject id=${canonical.id}: "${canonical.nameBn}" → "${CANONICAL_NEW_NAME_BN}"`,
  );
}

async function main() {
  const prisma = new PrismaClient();
  try {
    await cleanupBankFinancialSubjects(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("cleanup-bank-financial-subjects.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}

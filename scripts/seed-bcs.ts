/**
 * scripts/seed-bcs.ts
 * ----------------------------------------------------------------------------
 * Seeds BCS exam-wise questions + the exam taxonomy into the Question table.
 *
 * DELEGATES to scripts/import-bcs-exams.ts, the single source of truth for the
 * exam-library import pipeline. That pipeline:
 *
 *   • Bootstraps the hierarchy ExamCategory "BCS" → Exam "BCS Preliminary" →
 *     ExamPaper ("৫০তম বিসিএস প্রিলিমিনারি", …) for the exam terms actually
 *     present in the corpus.
 *   • Imports ONLY structurally valid MCQs (≥4 options + a resolvable exact
 *     answer). Degraded OCR records (preamble, <4 options, unresolvable answer,
 *     unknown subject) are counted and reported — never fabricated.
 *   • Upserts by (subjectId, sourceKey) where sourceKey is isolated to the
 *     exam-wise key space (md5(subjectId|exam:<term>|question)), so rows never
 *     collide with (or overwrite) the subject-wise corpus. Re-runs are
 *     idempotent; ids and user bookmarks/attempts stay stable.
 *
 * This file is wired into database/prisma/seed.ts via `seedBcsQuestions`. It is
 * NON-DESTRUCTIVE and safe to run on every deploy.
 *
 * Run standalone:  npx tsx scripts/seed-bcs.ts
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";
import { importBcsExams } from "./import-bcs-exams";

/**
 * Seed the BCS exam-wise questions (and exam taxonomy) for the main seed flow.
 * Returns the number of NEWLY imported questions (0 when already seeded).
 */
export async function seedBcsQuestions(prisma: PrismaClient): Promise<number> {
  const report = await importBcsExams(prisma, { dryRun: false });
  // importBcsExams already created/refreshed the ExamCategory/Exam/ExamPaper
  // taxonomy and upserted every valid question. Reporter output is handled
  // inside; here we summarize for the parent seed.
  console.log(
    `  ✓ BCS exam-wise: ${report.valid} valid, ${report.imported} inserted, ` +
      `${report.updated} updated, ${report.duplicates} dupes, ` +
      `${report.invalid} invalid/unusable (reported, not fabricated)`,
  );
  return report.imported;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const inserted = await seedBcsQuestions(prisma);
    console.log(`\nDone. Seeded ${inserted} NEW BCS exam-wise questions.`);
  } catch (e) {
    console.error("BCS seed failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("seed-bcs.ts")) {
  main().catch((e) => {
    console.error("BCS seed failed:", e);
    process.exit(1);
  });
}

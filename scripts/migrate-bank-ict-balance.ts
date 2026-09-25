/**
 * scripts/migrate-bank-ict-balance.ts
 * ----------------------------------------------------------------------------
 * One-time migration: rewrites stored option order for Bank ICT questions so
 * correct answers distribute ~25% per position (source files are ~65% B).
 *
 * Same algorithm as the importer (balanceOptions over sourceKey-sorted rows,
 * round-robin slots, seeded distractor order) — rerunning the importer after
 * this migration reproduces these exact rows. Grading compares option TEXT,
 * so reordering is score-safe; correctAnswer text is never modified.
 *
 * Rows whose correctAnswer is missing from options are left untouched and
 * reported. Run: `npx tsx scripts/migrate-bank-ict-balance.ts`.
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";
import { balanceOptions } from "./import-bank-ict";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
    if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing");
    const subject = await prisma.subject.findUnique({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: "তথ্য ও যোগাযোগ প্রযুক্তি" } },
    });
    if (!subject) throw new Error("Bank ICT subject missing");

    const rows = await prisma.question.findMany({
      where: { subjectId: subject.id, sourceExam: { startsWith: "Bank ICT" } },
      select: { id: true, sourceKey: true, options: true, correctAnswer: true },
      orderBy: { sourceKey: "asc" },
    });
    console.log(`  ${rows.length} Bank ICT rows to balance`);

    const updates: { id: number; options: [string, string, string, string] }[] = [];
    let skipped = 0;
    rows.forEach((r, i) => {
      const opts = r.options as unknown as string[];
      if (!Array.isArray(opts) || opts.length !== 4 || !opts.includes(r.correctAnswer)) {
        skipped++;
        console.warn(`  [skip] id=${r.id}: correctAnswer not in 4 options`);
        return;
      }
      updates.push({
        id: r.id,
        options: balanceOptions(opts as [string, string, string, string], r.correctAnswer, i % 4, r.sourceKey),
      });
    });

    for (let i = 0; i < updates.length; i += 200) {
      const chunk = updates.slice(i, i + 200);
      await prisma.$transaction(
        chunk.map((u) => prisma.question.update({ where: { id: u.id }, data: { options: u.options } })),
      );
      console.log(`  ✓ ${Math.min(i + 200, updates.length)}/${updates.length} rewritten`);
    }
    console.log(`\n✓ Done. ${updates.length} balanced, ${skipped} skipped`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("migrate-bank-ict-balance.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}

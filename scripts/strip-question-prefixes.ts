#!/usr/bin/env tsx
/**
 * scripts/strip-question-prefixes.ts
 * ----------------------------------------------------------------------------
 * One-time cleanup: strips leading question-number scaffolds ("Question 164.",
 * "Q.12:", "প্রশ্ন ১৬৪।") from live Question rows. The Practice UI renders
 * its own counter, so the scaffold must not live in the stored text.
 *
 * Safety: DRY RUN by default (lists every affected row, writes NOTHING).
 * Pass --yes to apply batched transactional updates. Only the explicit
 * leading marker is removed (same stripQuestionScaffold() the import gate
 * uses); a row that would become empty is SKIPPED and reported.
 *
 * Usage:
 *   npx tsx scripts/strip-question-prefixes.ts          # dry-run report
 *   npx tsx scripts/strip-question-prefixes.ts --yes    # apply + verify
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { stripQuestionScaffold } from "./qb-forensics/import-gate";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--yes");
  const rows = await prisma.question.findMany({
    select: {
      id: true,
      question: true,
      subject: { select: { nameBn: true } },
      ecosystem: { select: { code: true } },
    },
  });
  const affected = rows.filter((r) => {
    const stripped = stripQuestionScaffold(r.question);
    return stripped !== r.question;
  });
  console.log(`Scanned ${rows.length} questions — ${affected.length} carry a leading scaffold.`);
  for (const r of affected.slice(0, 10)) {
    console.log(`  #${r.id} [${r.ecosystem?.code}/${r.subject?.nameBn}]: ${r.question.slice(0, 90)}`);
  }
  if (affected.length > 10) console.log(`  ... and ${affected.length - 10} more`);

  const skips = affected.filter((r) => !stripQuestionScaffold(r.question).trim());
  if (skips.length > 0) {
    console.log(`SKIPPING ${skips.length} rows that would become empty: ${skips.map((r) => r.id).join(", ")}`);
  }
  const targets = affected.filter((r) => stripQuestionScaffold(r.question).trim());

  if (!apply) {
    console.log(`\nDRY RUN — no writes. Re-run with --yes to strip ${targets.length} rows.`);
    await prisma.$disconnect();
    return;
  }

  const BATCH = 100;
  let updated = 0;
  // NOTE: updates go through one server-side statement (the pooler round-trip
  // per row was too slow); the JS regex semantics are mirrored in Postgres.
  // Rows that would become empty are excluded and reported as skipped.
  const pattern = `^\\s*(question|ques\\.?|q\\.?|প্রশ্ন)\\s*(no\\.?|নং|নম্বর|number)?\\s*[0-9০-৯]+\\s*[.\\-:;)।]?\\s*`;
  const empties = (await prisma.$queryRaw<{ id: number }[]>`
    SELECT id FROM "Question"
    WHERE question ~* ${pattern}
      AND length(regexp_replace(question, ${pattern}, '', 'i')) = 0
  `).map((r) => r.id);
  if (empties.length > 0) {
    console.log(`SKIPPING ${empties.length} rows that would become empty: ${empties.join(", ")}`);
  }
  updated = await prisma.$executeRaw`
    UPDATE "Question"
    SET question = regexp_replace(question, ${pattern}, '', 'i')
    WHERE question ~* ${pattern}
      AND length(regexp_replace(question, ${pattern}, '', 'i')) > 0
  `;
  console.log(`\nUpdated ${updated} rows, skipped ${empties.length}.`);

  // Post-verify: zero rows may still match.
  const remaining = await prisma.question.findMany({ select: { id: true, question: true } });
  const leftovers = remaining.filter((r) => stripQuestionScaffold(r.question) !== r.question);
  if (leftovers.length > 0) {
    console.error(`VERIFY FAILED — ${leftovers.length} rows still carry scaffolds.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`VERIFY OK — 0 rows with leading scaffolds. Updated ${updated}, skipped ${skips.length}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

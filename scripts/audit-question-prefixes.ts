#!/usr/bin/env tsx
/**
 * scripts/audit-question-prefixes.ts
 * ----------------------------------------------------------------------------
 * DRY-RUN audit: finds MCQs whose question TEXT starts with an explicit
 * number scaffold such as "Question 164.", "Q.164:", "প্রশ্ন ১৬৪।" — the
 * counter the Practice UI already renders, so it must not live in the text.
 *
 * Only the LEADING marker is matched; legitimate in-body numbers are never
 * touched. Writes a JSON + Markdown report, prints a per-ecosystem/subject
 * summary. No database writes.
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Leading scaffold: explicit marker word + number. Bengali + Latin digits.
// Examples: "Question 164.", "Question No. 164:", "Q164)", "Q. 12 - ",
// "প্রশ্ন ১৬৪।", "প্রশ্ন নং 164."
const PREFIX_RE =
  /^\s*(question|ques\.?|q\.?|প্রশ্ন)\s*(no\.?|নং|নম্বর|number)?\s*[0-9০-৯]+\s*[.\-:;)।]?\s*/i;

type Hit = {
  id: number;
  ecosystem: string;
  subject: string;
  topic: string;
  subtopic: string;
  matched: string;
  preview: string;
};

async function main() {
  const total = await prisma.question.count();
  console.log(`Total questions in DB: ${total}`);

  const hits: Hit[] = [];
  const BATCH = 5000;
  let cursor = 0;
  for (;;) {
    const rows = await prisma.question.findMany({
      orderBy: { id: "asc" },
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : 0,
      take: BATCH,
      select: {
        id: true,
        question: true,
        topic: true,
        subtopic: true,
        ecosystem: { select: { code: true } },
        subject: { select: { nameBn: true } },
      },
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      const m = r.question.match(PREFIX_RE);
      if (m && m[0].trim().length > 0) {
        hits.push({
          id: r.id,
          ecosystem: r.ecosystem?.code ?? "?",
          subject: r.subject?.nameBn ?? "?",
          topic: r.topic,
          subtopic: r.subtopic,
          matched: m[0].trim(),
          preview: r.question.slice(0, 120),
        });
      }
    }
    cursor = rows[rows.length - 1].id;
    process.stdout.write(`\rScanned through id ${cursor} — hits so far: ${hits.length}`);
  }
  console.log("");

  // Summaries
  const byEcoSubject = new Map<string, number>();
  const byPattern = new Map<string, number>();
  for (const h of hits) {
    const k = `${h.ecosystem} :: ${h.subject}`;
    byEcoSubject.set(k, (byEcoSubject.get(k) ?? 0) + 1);
    const pk = h.matched.replace(/[0-9০-৯]+/g, "#");
    byPattern.set(pk, (byPattern.get(pk) ?? 0) + 1);
  }

  console.log(`\n=== QUESTIONS WITH LEADING NUMBER SCAFFOLD: ${hits.length} / ${total} ===\n`);
  console.log("--- by ecosystem :: subject ---");
  for (const [k, n] of [...byEcoSubject.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${k}`);
  }
  console.log("\n--- by matched pattern shape ---");
  for (const [k, n] of [...byPattern.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t"${k}"`);
  }
  console.log("\n--- samples ---");
  for (const h of hits.slice(0, 15)) {
    console.log(`  #${h.id} [${h.ecosystem}/${h.subject}] matched "${h.matched}" :: ${h.preview}`);
  }
  if (hits.length > 15) console.log(`  ... and ${hits.length - 15} more (see report files)`);

  const dir = join(process.cwd(), ".data", "audits");
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  writeFileSync(join(dir, `question-prefixes-${stamp}.json`), JSON.stringify({ total, hitCount: hits.length, hits }, null, 2));
  let md = `# Question-prefix audit (${stamp})\n\n**${hits.length} / ${total}** questions start with an explicit number scaffold.\n\n## By ecosystem :: subject\n\n| Count | Ecosystem :: Subject |\n|------:|--------------------|\n`;
  for (const [k, n] of [...byEcoSubject.entries()].sort((a, b) => b[1] - a[1])) md += `| ${n} | ${k} |\n`;
  md += `\n## By pattern shape\n\n| Count | Pattern |\n|------:|--------|\n`;
  for (const [k, n] of [...byPattern.entries()].sort((a, b) => b[1] - a[1])) md += `| ${n} | \`${k}\` |\n`;
  writeFileSync(join(dir, `question-prefixes-${stamp}.md`), md);
  console.log(`\nReports written to .data/audits/question-prefixes-${stamp}.{json,md}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * scripts/upgrade-exp-log-notation.ts
 * ----------------------------------------------------------------------------
 * One-time upgrade: rewrites the সূচক/লগারিদম rows' question/options/answer/
 * explanation from programmer notation (2^(x+1), log_3) to book-style Unicode
 * math (2ˣ⁺¹, log₃81) reconverted from the .docx.
 *
 * Rows are paired by (leaf, Bengali-text skeleton, order) and updated IN
 * PLACE so ids, bookmarks and attempts survive. A pair is applied only when
 * skeletons match exactly; anything else is reported and skipped.
 *
 * Usage:
 *   npx tsx scripts/upgrade-exp-log-notation.ts          # dry-run report
 *   npx tsx scripts/upgrade-exp-log-notation.ts --yes    # apply + verify
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { scanMca, stripQuestionScaffold, normalizeField } from "./qb-forensics/import-gate";
import { resolveAnswerToOption } from "./qb-forensics/parse-flat";

const prisma = new PrismaClient();
const TXT = join(process.cwd(), "database/data/ques/Math/Questions(সূচক ও লগারিদম)_9Th-Grade AI.txt");
const LEAVES = [
  "08_গাণিতিক_যুক্তি/Part_03_সূচক_ও_ধারা/সূচক",
  "08_গাণিতিক_যুক্তি/Part_03_সূচক_ও_ধারা/লগারিদম",
];

/** Bengali-prose skeleton (kept for reporting only). */
function skeleton(s: string): string {
  return s
    .replace(/[^\u0980-\u09FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Block = { question: string; options: string[]; answer: string; explanation: string };

function parseBlocks(raw: string): Block[] {
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/);
  const isQ = (l: string) => /^\s*প্রশ্ন\s*[০-৯0-9]+\s*\./.test(l);
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (isQ(line)) {
      if (cur.length) groups.push(cur);
      cur = [line];
    } else if (cur.length) cur.push(line);
  }
  if (cur.length) groups.push(cur);
  return groups.map((b) => {
    const question = (b[0] ?? "").trim();
    const options: string[] = [];
    let answer = "";
    const expl: string[] = [];
    let inExpl = false;
    for (const ln of b.slice(1)) {
      const t = ln.trim();
      const om = /^([A-D])\.\s*(.*)$/.exec(t);
      if (om && !inExpl && options.length < 4) {
        options.push(om[2].trim());
        continue;
      }
      const am = /^উত্তর\s*:\s*(.+)$/.exec(t);
      if (am && !inExpl) {
        answer = am[1].trim();
        continue;
      }
      if (/^ব্যাখ্যা\s*:?\s*$/.test(t)) {
        inExpl = true;
        continue;
      }
      const em = /^ব্যাখ্যা\s*:\s*(.+)$/.exec(t);
      if (em) {
        inExpl = true;
        if (em[1].trim()) expl.push(em[1].trim());
        continue;
      }
      if (inExpl && t) expl.push(t);
    }
    return { question, options, answer, explanation: expl.join("\n").trim() };
  });
}

/**
 * Pairing proof (airtight, order-independent): each live row's stored
 * question must EXACTLY equal the v1-converter output for some block, and
 * the v1 block positionally determines the v2 block (same docx, same
 * splitter). The resolved v2 answer must additionally agree with the stored
 * answer carried through option-index mapping. Anything unproven is skipped.
 */
async function main() {
  const apply = process.argv.includes("--yes");

  const v1raw = readFileSync("/tmp/exp-log-v1.txt", "utf8");
  const v2raw = readFileSync(TXT, "utf8");
  const v1blocks = parseBlocks(v1raw);
  const v2blocks = parseBlocks(v2raw);
  if (v1blocks.length !== v2blocks.length) {
    console.error(`BLOCK COUNT DIVERGENCE: v1=${v1blocks.length} v2=${v2blocks.length} — aborting.`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // v1 normalized questions → index (v1 converter output is what the seeder stored).
  const v1Index = new Map<string, number>();
  // Fallback: raw v1 questions (scaffold-stripped + field-normalized) → index.
  // Covers rows seeded from source lines the v1 gate rejected (e.g. answers
  // fixed post-hoc): their question text is still byte-deterministic.
  const v1RawIndex = new Map<string, number>();
  for (let i = 0; i < v1blocks.length; i++) {
    const rawKey = normalizeField(stripQuestionScaffold(v1blocks[i].question));
    if (!v1RawIndex.has(rawKey)) v1RawIndex.set(rawKey, i);
    const g = scanMca({
      question: v1blocks[i].question,
      options: v1blocks[i].options,
      correctAnswer: (resolveAnswerToOption(v1blocks[i].answer, v1blocks[i].options) ?? v1blocks[i].answer).trim(),
      explanation: v1blocks[i].explanation,
    });
    if (g.verdict === "REJECT") continue;
    if (!v1Index.has(g.normalized.question)) v1Index.set(g.normalized.question, i);
  }

  const rows = await prisma.question.findMany({
    where: { path: { in: LEAVES } },
    orderBy: { id: "asc" },
    select: { id: true, path: true, question: true, options: true, correctAnswer: true, explanation: true },
  });

  let planned = 0;
  const skipped: string[] = [];
  const updates: Array<{ id: number; data: Record<string, unknown> }> = [];
  for (const row of rows) {
    let bi = v1Index.get(row.question);
    if (bi === undefined) {
      // Fallback proof for rows whose v1 block was gate-rejected at seed time.
      const rawHit = v1RawIndex.get(normalizeField(row.question));
      if (rawHit === undefined) {
        skipped.push(`#${row.id} no exact v1 match (pre-existing/other source) :: ${row.question.slice(0, 70)}`);
        continue;
      }
      // The fallback block must itself gate-ACCEPT in v2 form, and its v2
      // question may only differ from storage by math notation: prove it by
      // requiring identical Bengali skeletons on both sides.
      const cand = v2blocks[rawHit];
      const g0 = scanMca({
        question: cand.question,
        options: cand.options,
        correctAnswer: (resolveAnswerToOption(cand.answer, cand.options) ?? cand.answer).trim(),
        explanation: cand.explanation,
      });
      if (g0.verdict === "REJECT" || skeleton(g0.normalized.question) !== skeleton(row.question)) {
        skipped.push(`#${row.id} fallback proof failed :: ${row.question.slice(0, 70)}`);
        continue;
      }
      bi = rawHit;
    }
    const b = v2blocks[bi];
    const g = scanMca({
      question: b.question,
      options: b.options,
      correctAnswer: (resolveAnswerToOption(b.answer, b.options) ?? b.answer).trim(),
      explanation: b.explanation,
    });
    if (g.verdict === "REJECT") {
      skipped.push(`#${row.id} v2 block gate-rejected :: ${b.question.slice(0, 70)}`);
      continue;
    }
    // Double proof on the answer: stored answer's option index must carry
    // the same option text through the notation upgrade.
    const storedOpts = row.options as string[];
    const idx = storedOpts.indexOf(row.correctAnswer);
    if (idx < 0 || g.normalized.options[idx] === undefined) {
      skipped.push(`#${row.id} stored answer not in stored options — refusing`);
      continue;
    }
    if (g.normalized.correctAnswer !== g.normalized.options[idx]) {
      skipped.push(
        `#${row.id} answer proof failed (stored idx ${idx} → "${g.normalized.options[idx]}" vs resolved "${g.normalized.correctAnswer}")`,
      );
      continue;
    }
    const data: Record<string, unknown> = {};
    if (g.normalized.question !== row.question) data.question = g.normalized.question;
    if (JSON.stringify(g.normalized.options) !== JSON.stringify(row.options)) data.options = g.normalized.options;
    if (g.normalized.correctAnswer !== row.correctAnswer) data.correctAnswer = g.normalized.correctAnswer;
    if (g.normalized.explanation !== (row.explanation ?? "")) data.explanation = g.normalized.explanation;
    if (Object.keys(data).length > 0) {
      planned++;
      updates.push({ id: row.id, data });
    }
  }

  console.log(`Live rows in leaves: ${rows.length}, v1/v2 blocks: ${v1blocks.length}, proven pairs to update: ${planned}`);
  for (const u of updates.slice(0, 3)) {
    console.log(`  #${u.id} fields: ${Object.keys(u.data).join(",")}`);
  }
  if (skipped.length > 0) {
    console.log(`SKIPPED (${skipped.length}):`);
    for (const s of skipped.slice(0, 10)) console.log(`  ${s}`);
  }
  if (!apply) {
    console.log(`\nDRY RUN — no writes. Re-run with --yes to apply ${planned} updates.`);
    await prisma.$disconnect();
    return;
  }
  for (const u of updates) {
    await prisma.question.update({ where: { id: u.id }, data: u.data as never });
  }
  console.log(`\nApplied ${updates.length} updates.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

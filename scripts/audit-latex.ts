#!/usr/bin/env tsx
/**
 * scripts/audit-latex.ts
 * ----------------------------------------------------------------------------
 * READ-ONLY LaTeX-artifact report. Classifies every question-bearing row
 * (Question, QuizQuestion, MockTestQuestion) through the canonical pipeline
 * and prints:
 *
 *   - summary counts per table (CLEAN / HEALED / REVIEW)
 *   - HEALED samples (before → after) — what `math:heal` would write
 *   - ALL REVIEW rows with field reasons — manual-fix queue
 *
 * Never writes to the database. Pair with heal-latex-artifacts.ts for the
 * dry-run → backup → apply cycle.
 *
 * Usage:
 *   npx tsx scripts/audit-latex.ts               # full report
 *   npx tsx scripts/audit-latex.ts --healable    # only HEALED samples
 *   npx tsx scripts/audit-latex.ts --review      # only REVIEW rows
 * ----------------------------------------------------------------------------
 */
import { join } from "path";
import { config } from "dotenv";
config({ path: join(process.cwd(), ".env.local") });
config({ path: join(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import {
  classifyRow,
  mapQuestionRow,
  mapChildRow,
  type RowResult,
} from "./latex-heal/shared";

const prisma = new PrismaClient();

const clip = (s: string, n = 140) =>
  s.length > n ? s.slice(0, n).replace(/\s+/g, " ") + "…" : s.replace(/\s+/g, " ");

async function collect(): Promise<RowResult[]> {
  const out: RowResult[] = [];
  const questions = await prisma.question.findMany({
    select: {
      id: true,
      question: true,
      options: true,
      correctAnswer: true,
      explanation: true,
      statements: true,
      correctAnswers: true,
    },
    orderBy: { id: "asc" },
  });
  for (const r of questions) out.push(classifyRow("Question", mapQuestionRow(r)));
  const quizzes = await prisma.quizQuestion.findMany({
    select: { id: true, question: true, options: true, correctAnswer: true, explanation: true },
    orderBy: { id: "asc" },
  });
  for (const r of quizzes) out.push(classifyRow("QuizQuestion", mapChildRow(r)));
  const mocks = await prisma.mockTestQuestion.findMany({
    select: { id: true, question: true, options: true, correctAnswer: true, explanation: true },
    orderBy: { id: "asc" },
  });
  for (const r of mocks) out.push(classifyRow("MockTestQuestion", mapChildRow(r)));
  return out;
}

function summarize(rows: RowResult[]): void {
  const tables = [...new Set(rows.map((r) => r.table))];
  console.log("\n=== SUMMARY ===");
  console.log(
    "table".padEnd(20) + "rows".padStart(7) + "clean".padStart(8) + "healed".padStart(9) + "review".padStart(9),
  );
  for (const t of tables) {
    const rs = rows.filter((r) => r.table === t);
    console.log(
      t.padEnd(20) +
        String(rs.length).padStart(7) +
        String(rs.filter((r) => r.verdict === "CLEAN").length).padStart(8) +
        String(rs.filter((r) => r.verdict === "HEALED").length).padStart(9) +
        String(rs.filter((r) => r.verdict === "REVIEW").length).padStart(9),
    );
  }
  const healedFields = rows
    .flatMap((r) => r.fields)
    .filter((f) => f.changed).length;
  console.log(
    `\ntotals: rows=${rows.length} healed-rows=${rows.filter((r) => r.verdict === "HEALED").length} ` +
      `healed-fields=${healedFields} review-rows=${rows.filter((r) => r.verdict === "REVIEW").length}`,
  );
}

function printHealed(rows: RowResult[], limit: number): void {
  const healed = rows.filter((r) => r.verdict === "HEALED");
  console.log(`\n=== HEALED (${healed.length} rows — write candidates; showing ${Math.min(limit, healed.length)}) ===`);
  for (const r of healed.slice(0, limit)) {
    console.log(`\n[${r.table} #${r.id}]`);
    for (const f of r.fields.filter((x) => x.changed)) {
      console.log(`  ${f.field}:`);
      console.log(`    - ${clip(f.original)}`);
      console.log(`    + ${clip(f.output)}`);
    }
  }
}

function printReview(rows: RowResult[]): void {
  const review = rows.filter((r) => r.verdict === "REVIEW");
  console.log(`\n=== REVIEW (${review.length} rows — never written; manual-fix queue) ===`);
  for (const r of review) {
    const bad = r.fields.filter((f) => f.verdict === "REVIEW");
    const why = [
      ...r.reasons,
      ...bad.flatMap((f) => f.reasons.map((x) => `${f.field}: ${x}`)),
    ];
    console.log(`\n[${r.table} #${r.id}] ${why.join(" | ")}`);
    for (const f of bad.slice(0, 2)) {
      console.log(`  ${f.field}: ${clip(f.original, 200)}`);
    }
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const rows = await collect();
  if (mode === "--review") {
    summarize(rows);
    printReview(rows);
    return;
  }
  if (mode === "--healable") {
    summarize(rows);
    printHealed(rows, 50);
    return;
  }
  summarize(rows);
  printHealed(rows, 15);
  printReview(rows);
}

main()
  .catch((e) => {
    console.error("audit failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

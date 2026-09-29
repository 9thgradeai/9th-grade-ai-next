#!/usr/bin/env tsx
/**
 * scripts/heal-latex-artifacts.ts
 * ----------------------------------------------------------------------------
 * Deterministic LaTeX-artifact heal for the live database. Pushes every
 * question-bearing row (Question, QuizQuestion, MockTestQuestion) through
 * the canonical pipeline and writes ONLY rows that classify HEALED
 * (changed + valid + preservation + KaTeX clean + answer/options invariant).
 * REVIEW rows are never touched — they are reported for manual fixing.
 *
 * Contract (qb-forensics/migrate.ts parity):
 *   1. DRY-RUN (default) — full report, zero writes.
 *   2. --apply           — pg_dump backup, then a single transactional
 *                          write of all HEALED rows, then re-verify
 *                          (must end with 0 HEALED rows = idempotent).
 *   3. --skip-backup     — opt out of the backup (not recommended).
 *
 * Usage:
 *   npx tsx scripts/heal-latex-artifacts.ts                 # dry-run
 *   npx tsx scripts/heal-latex-artifacts.ts --apply         # backup + write + verify
 * ----------------------------------------------------------------------------
 */
import { join } from "path";
import { mkdirSync } from "fs";
import { execFileSync } from "child_process";
import { config } from "dotenv";
config({ path: join(process.cwd(), ".env.local") });
config({ path: join(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";
import { backupDatabase } from "./qb-forensics/migrate";
import {
  classifyRow,
  mapQuestionRow,
  mapChildRow,
  type RowResult,
} from "./latex-heal/shared";

const prisma = new PrismaClient();

const clip = (s: string, n = 140) =>
  s.length > n ? s.slice(0, n).replace(/\s+/g, " ") + "…" : s.replace(/\s+/g, " ");

/**
 * pg_dump must be >= the server major (Neon runs 18; Homebrew's bare
 * `pg_dump` may be older). Honors $PG_DUMP first, then known Homebrew
 * libpq paths, then PATH.
 */
function resolvePgDump(): string {
  const candidates = [
    process.env.PG_DUMP,
    "/opt/homebrew/opt/libpq@18/bin/pg_dump",
    "/opt/homebrew/opt/libpq/bin/pg_dump",
    "pg_dump",
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    try {
      const v = execFileSync(c, ["--version"], { encoding: "utf8" });
      const major = Number(/(\d+)\./.exec(v)?.[1] ?? 0);
      if (major >= 18) return c;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "No pg_dump >= 18 found. Install libpq@18 or set PG_DUMP=/path/to/pg_dump.",
  );
}

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

function counts(rows: RowResult[]): string {
  return (
    `rows=${rows.length} ` +
    `clean=${rows.filter((r) => r.verdict === "CLEAN").length} ` +
    `healed=${rows.filter((r) => r.verdict === "HEALED").length} ` +
    `review=${rows.filter((r) => r.verdict === "REVIEW").length}`
  );
}

function printPlan(healed: RowResult[], sampleLimit: number): void {
  const fields = healed.flatMap((r) => r.fields.filter((f) => f.changed));
  console.log(`\nWRITE PLAN: ${healed.length} rows / ${fields.length} fields`);
  for (const r of healed.slice(0, sampleLimit)) {
    console.log(`\n[${r.table} #${r.id}]`);
    for (const f of r.fields.filter((x) => x.changed)) {
      console.log(`  ${f.field}:`);
      console.log(`    - ${clip(f.original)}`);
      console.log(`    + ${clip(f.output)}`);
    }
  }
  if (healed.length > sampleLimit) {
    console.log(`\n… and ${healed.length - sampleLimit} more rows`);
  }
}

async function writeRows(healed: RowResult[]): Promise<number> {
  let written = 0;
  await prisma.$transaction(
    async (tx) => {
      for (const r of healed) {
        const data = r.changes;
        if (r.table === "Question") {
          await tx.question.update({ where: { id: r.id }, data });
        } else if (r.table === "QuizQuestion") {
          await tx.quizQuestion.update({ where: { id: r.id }, data });
        } else if (r.table === "MockTestQuestion") {
          await tx.mockTestQuestion.update({ where: { id: r.id }, data });
        } else {
          throw new Error(`unknown table ${r.table}`);
        }
        written++;
      }
    },
    // 1243+ sequential updates over a pooled remote connection exceed the
    // 5s interactive-transaction default by a wide margin.
    { timeout: 600_000, maxWait: 15_000 },
  );
  return written;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const skipBackup = process.argv.includes("--skip-backup");

  console.log("Scanning and classifying all question rows…");
  const rows = await collect();
  console.log(`SCAN: ${counts(rows)}`);

  const healed = rows.filter((r) => r.verdict === "HEALED");
  const review = rows.filter((r) => r.verdict === "REVIEW");

  if (!apply) {
    printPlan(healed, 15);
    console.log(
      `\nDRY-RUN — no writes performed. ${review.length} REVIEW row(s) are listed by ` +
        `\`npm run math:audit\` and will never be touched.`,
    );
    console.log("Re-run with --apply to back up and write the HEALED rows.");
    return;
  }

  if (healed.length === 0) {
    console.log("\nNothing to heal — database already at fixpoint.");
    return;
  }

  printPlan(healed, 5);

  if (!skipBackup) {
    const dir = join(process.cwd(), "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dumpPath = join(dir, `latex-heal-${stamp}.dump`);
    console.log(`\nBacking up database → ${dumpPath}`);
    backupDatabase(dumpPath, resolvePgDump());
  } else {
    console.log("\nWARNING: --skip-backup — writing without a pg_dump.");
  }

  const written = await writeRows(healed);
  console.log(`\nWROTE: ${written} row(s)`);

  console.log("Re-verifying (idempotency + review net)…");
  const after = await collect();
  const stillHealed = after.filter((r) => r.verdict === "HEALED");
  console.log(`AFTER: ${counts(after)}`);
  if (stillHealed.length > 0) {
    console.error(
      `ERROR: ${stillHealed.length} row(s) still classify HEALED after write — ` +
        `not at fixpoint. Re-run the dry-run to inspect.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `OK: fixpoint reached (0 HEALED). ${after.filter((r) => r.verdict === "REVIEW").length} ` +
      "REVIEW row(s) remain for manual fixing — see `npm run math:audit`.",
  );
}

main()
  .catch((e) => {
    console.error("heal failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

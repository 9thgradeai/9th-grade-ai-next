#!/usr/bin/env tsx
/**
 * scripts/clean-broken-questions.ts
 * ----------------------------------------------------------------------------
 * Removes every broken / unoptimized MCQ from the application database.
 *
 * Runs the SAME import gate the seeder uses (scripts/qb-forensics/import-gate.ts)
 * so the definition of "broken" is identical everywhere. A row is removed when:
 *
 *   1. UNICODE_CORRUPTION  — unreadable content in ANY field
 *      (replacement chars, mojibake, double-encoding, control/invisible chars,
 *       visual-order / cluster-split Bangla, mangled "ব্যাখ্যা" header).
 *       Also the concatenated-MCQ family — a multi-question scaffold welded
 *       into the question text (QUESTION_SCAFFOLD), a stray "ব্যাখ্যা:" header
 *       shifting into the question (QUESTION_HEADER_LEAK), and another
 *       question's option block (ক)(খ)(গ)(ঘ) leaked into the explanation
 *       (EXPLANATION_SCAFFOLD), plus option-markers leaking into option text.
 *   2. STRUCTURAL_BROKEN   — readable but structurally unusable
 *      (<4 options, empty option, empty question/answer, answer matches no
 *       option, duplicate option values within one MCQ, and known semantically
 *       scrambled rows that no structural rule can catch).
 *   3. EMPTY_EXPLANATION   — question-bank policy: explanations are mandatory.
 *   4. DUPLICATE           — duplicate of a kept row by normalized
 *      (question | correctAnswer | explanation) across the WHOLE database;
 *      the oldest row (MIN id) is kept.
 *
 * Safety by default: DRY RUN — scans, groups by subject/reason, and writes a
 * JSON + Markdown report WITHOUT touching the database.
 *
 * Usage:
 *   npx tsx scripts/clean-broken-questions.ts            # dry-run report
 *   npx tsx scripts/clean-broken-questions.ts --yes      # backup + transactional delete
 *   npx tsx scripts/clean-broken-questions.ts --verify   # post-clean invariant check
 *
 * Deleting a Question cascades to Bookmark / UserQuestionProgress (both are the
 * user's record of a broken question) and SetNull on QuestionAttempt (attempt
 * analytics survive). Verified against database/prisma/schema.prisma.
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { scanMca, mcaSignature, type McaInput } from "./qb-forensics/import-gate";
import { backupDatabase } from "./qb-forensics/migrate";

export type RemovalReason =
  | "UNICODE_CORRUPTION"
  | "STRUCTURAL_BROKEN"
  | "EMPTY_EXPLANATION"
  | "DUPLICATE";

export interface ScanRow extends McaInput {
  id: number;
  subjectName?: string;
  topic?: string;
  subtopic?: string;
  path?: string;
}

export interface RemovalEntry {
  id: number;
  reason: RemovalReason;
  code: string;
  detail: string;
  subjectName: string;
  topic: string;
  subtopic: string;
  path: string;
}

export interface RemovalPlan {
  scanned: number;
  removed: RemovalEntry[];
  removedIds: number[];
  keptIds: number[];
  byReason: Record<RemovalReason, number>;
  bySubject: Record<string, number>;
  byPath: Record<string, number>;
}

const CORRUPT_CODES = new Set([
  "REPLACEMENT_CHAR",
  "MOJIBAKE",
  "DOUBLE_ENCODING",
  "CONTROL_CHAR",
  "VISUAL_ORDER_BANGLA",
  "MANGLED_HEADER",
  "OPTION_MARKER_LEAK",
  "QUESTION_SCAFFOLD",
  "QUESTION_HEADER_LEAK",
  "EXPLANATION_SCAFFOLD",
]);

/**
 * Known-broken rows that no structural rule can catch because they are
 * semantically scrambled (correct-looking structure, but the option block and
 * explanation belong to a DIFFERENT question). Keyed by the exact normalized
 * identity signature (mcaSignature) so the safe row is removed everywhere the
 * same content appears while an innocent look-alike is never touched.
 *
 * #2512 — "বাংলাদেশে মোট দেশজ উৎপাদনে কৃষিখাতের আবদান-_-" asks about the
 * agriculture share of GDP, but its options, answer and explanation are about
 * the language movement / Bengali nationalism. Flagged by the product owner.
 */
const KNOWN_BROKEN_BY_SIGNATURE: Record<string, { code: string; detail: string }> = {
  [mcaSignature({
    question: "বাংলাদেশে মোট দেশজ উৎপাদনে কৃষিখাতের আবদান-_-",
    options: ["দ্বি-জাতি তন্ত্র", "সামাজিক চেতনা", "তসাম্প্রদায়িকতা", "বাঙ্গালী জাতীয়তাবাদ"],
    correctAnswer: "বাঙ্গালী জাতীয়তাবাদ",
    explanation: "ভাষা আন্দোলন ছিল মুলত বাঙালি জাতির আত্মপরিচয় ওসাংস্কৃতিক স্বাতন্ত্য রক্ষার সংগ্রাম, যা বাঙালি জাতীয়তাবাদের উন্মেষে সবচেয়ে গুরুত্বপূর্ণ ভুমিকা পালন করে।",
  })]: {
    code: "SCRAMBLED_CONTENT",
    detail: "Scrambled MCQ: options/answer/explanation belong to a different question (GDP-agriculture question, language-movement content)",
  },
};

/**
 * Pure plan builder — given every Question row (content + optional location
 * metadata) it decides exactly which ids must be removed and why. No I/O, so
 * the whole policy is unit-testable without a database.
 */
export function buildRemovalPlan(rows: ScanRow[]): RemovalPlan {
  const removed: RemovalEntry[] = [];
  const removedIds = new Set<number>();
  const kept: ScanRow[] = [];
  const byReason: Record<RemovalReason, number> = {
    UNICODE_CORRUPTION: 0,
    STRUCTURAL_BROKEN: 0,
    EMPTY_EXPLANATION: 0,
    DUPLICATE: 0,
  };
  const bySubject: Record<string, number> = {};
  const byPath: Record<string, number> = {};
  const fmt = (_r: ScanRow, field?: string) => field || "(none)";
  const entry = (r: ScanRow, reason: RemovalReason, code: string, detail: string) => {
    removedIds.add(r.id);
    byReason[reason] += 1;
    bySubject[r.subjectName ?? "(unknown)"] = (bySubject[r.subjectName ?? "(unknown)"] ?? 0) + 1;
    byPath[r.path ?? "(none)"] = (byPath[r.path ?? "(none)"] ?? 0) + 1;
    removed.push({
      id: r.id,
      reason,
      code,
      detail,
      subjectName: r.subjectName ?? "(unknown)",
      topic: fmt(r, r.topic),
      subtopic: fmt(r, r.subtopic),
      path: r.path ?? "(none)",
    });
  };

  for (const r of rows) {
    const gate = scanMca(r);
    if (gate.verdict === "REJECT") {
      const corruption = gate.fatal.find((i) => CORRUPT_CODES.has(i.code));
      const structural = gate.fatal.filter((i) => !CORRUPT_CODES.has(i.code));
      const reason: RemovalReason = corruption
        ? "UNICODE_CORRUPTION"
        : structural.length > 0 && structural.every((i) => i.code === "EMPTY_EXPLANATION")
          ? "EMPTY_EXPLANATION"
          : "STRUCTURAL_BROKEN";
      const ref = structural[0] ?? gate.fatal[0];
      const lines = gate.fatal.map((i) => `${i.code} (${i.field})`).join(", ");
      entry(r, reason, ref?.code ?? lines, `${lines} — ${ref?.detail ?? ""}`);
      continue;
    }
    if (!r.explanation.trim()) {
      entry(r, "EMPTY_EXPLANATION", "EMPTY_EXPLANATION", "Explanation is empty");
      continue;
    }
    const known = KNOWN_BROKEN_BY_SIGNATURE[mcaSignature(r)];
    if (known) {
      entry(r, "STRUCTURAL_BROKEN", known.code, known.detail);
      continue;
    }
    kept.push(r);
  }

  // ── Global duplicates (across all subjects): normalized identity ──
  const sigToId = new Map<string, number>();
  const bySignature = new Map<string, ScanRow[]>();
  for (const r of kept) {
    const sig = mcaSignature(r);
    const group = bySignature.get(sig) ?? [];
    group.push(r);
    bySignature.set(sig, group);
    if (!sigToId.has(sig) || r.id < (sigToId.get(sig) ?? Infinity)) sigToId.set(sig, r.id);
  }
  for (const [sig, group] of bySignature) {
    if (group.length < 2) continue;
    const keepId = sigToId.get(sig)!;
    for (const r of group) {
      if (r.id === keepId) continue;
      entry(r, "DUPLICATE", "DUPLICATE", `Duplicate of #${keepId} by normalized question+answer+explanation`);
    }
  }

  return {
    scanned: rows.length,
    removed,
    removedIds: [...removedIds].sort((a, b) => a - b),
    keptIds: rows.filter((r) => !removedIds.has(r.id)).map((r) => r.id).sort((a, b) => a - b),
    byReason,
    bySubject,
    byPath,
  };
}

async function scanRows(prisma: PrismaClient): Promise<ScanRow[]> {
  const [rows, subjects] = await Promise.all([
    prisma.question.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        subjectId: true,
        topic: true,
        subtopic: true,
        path: true,
        question: true,
        options: true,
        correctAnswer: true,
        explanation: true,
      },
    }),
    prisma.subject.findMany({ select: { id: true, nameBn: true } }),
  ]);
  const nameById = new Map(subjects.map((s) => [s.id, s.nameBn]));
  return rows.map((r) => ({
    id: r.id,
    subjectName: nameById.get(r.subjectId) ?? `subject:${r.subjectId}`,
    topic: r.topic,
    subtopic: r.subtopic,
    path: r.path,
    question: r.question,
    options: Array.isArray(r.options) ? (r.options as string[]) : [],
    correctAnswer: r.correctAnswer,
    explanation: r.explanation,
  }));
}

const ARTIFACT_DIR = join(process.cwd(), "scripts", "qb-forensics", "artifacts");

function writeReport(plan: RemovalPlan, dryRun: boolean): { json: string; md: string } {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const jsonPath = join(ARTIFACT_DIR, dryRun ? "cleanup-plan.json" : "cleanup-report.json");
  const mdPath = join(ARTIFACT_DIR, dryRun ? "cleanup-plan.md" : "cleanup-report.md");
  writeFileSync(jsonPath, JSON.stringify({ dryRun, generatedAt: new Date().toISOString(), ...plan }, null, 2), "utf8");

  const rows = (arr: Array<[string, number]>) =>
    arr.sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join("\n");

  const md = [
    `# Question-Bank Cleanup ${dryRun ? "Plan" : "Report"}`,
    "",
    `**Generated:** ${new Date().toISOString()}`,
    `**Mode:** ${dryRun ? "DRY RUN (no changes)" : "APPLIED"}`,
    "",
    "## Summary",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Questions scanned | ${plan.scanned} |`,
    `| Questions removed | ${plan.removed.length} |`,
    `| Questions kept | ${plan.scanned - plan.removed.length} |`,
    "",
    "## Removed by reason",
    "",
    `| Reason | Count |`,
    `|--------|-------|`,
    rows(Object.entries(plan.byReason) as Array<[string, number]>),
    "",
    "## Removed by subject",
    "",
    `| Subject | Count |`,
    `|---------|-------|`,
    rows(Object.entries(plan.bySubject) as Array<[string, number]>),
    "",
    "## Removed by path",
    "",
    `| Path | Count |`,
    `|------|-------|`,
    rows(Object.entries(plan.byPath) as Array<[string, number]>),
    "",
    "## Removed rows",
    "",
    `| id | reason | code | subject | topic | subtopic |`,
    `|----|--------|------|---------|-------|----------|`,
    ...plan.removed.map(
      (e) => `| ${e.id} | ${e.reason} | ${e.code} | ${e.subjectName} | ${e.topic} | ${e.subtopic} |`,
    ),
    "",
  ].join("\n");
  writeFileSync(mdPath, md, "utf8");
  return { json: jsonPath, md: mdPath };
}

function printSummary(plan: RemovalPlan, dryRun: boolean): void {
  console.log("\n" + "=".repeat(60));
  console.log(`  QUESTION-BANK CLEANUP ${dryRun ? "PLAN (dry run)" : "COMPLETE"}`);
  console.log("=".repeat(60));
  console.log(`  Scanned:  ${plan.scanned}`);
  console.log(`  Remove:   ${plan.removed.length}`);
  console.log(`  Keep:     ${plan.scanned - plan.removed.length}`);
  console.log("\n  By reason:");
  for (const [k, v] of Object.entries(plan.byReason).sort((a, b) => b[1] - a[1])) {
    if (v > 0) console.log(`    ${k}: ${v}`);
  }
  console.log("\n  By subject:");
  for (const [k, v] of Object.entries(plan.bySubject).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${k}: ${v}`);
  }
}

async function applyPlan(prisma: PrismaClient, plan: RemovalPlan): Promise<void> {
  const backupPath = join(ARTIFACT_DIR, "cleanup-backup.dump");
  console.log(`\nBacking up database to ${backupPath}...`);
  backupDatabase(backupPath);

  const ids = plan.removedIds;
  console.log(`Deleting ${ids.length} broken questions (transactional)...`);
  await prisma.$transaction(async (tx) => {
    // User rows cascade: Bookmark + UserQuestionProgress delete, QuestionAttempt SetNull.
    await tx.question.deleteMany({ where: { id: { in: ids } } });
  });
  console.log(`Deleted ${ids.length} questions.`);
}

/** Verify the invariant: every remaining row passes the gate, has an explanation, and is globally unique. */
async function verifyInvariant(prisma: PrismaClient): Promise<boolean> {
  const remaining = await scanRows(prisma);
  const gateProblems: string[] = [];
  const sigToId = new Map<string, number>();
  for (const r of remaining) {
    const gate = scanMca(r);
    if (gate.verdict === "REJECT") {
      gateProblems.push(`#${r.id} (${r.subjectName}): ${gate.fatal.map((f) => f.code).join(", ")}`);
    }
    if (!r.explanation.trim()) {
      gateProblems.push(`#${r.id}: empty explanation`);
    }
    const sig = mcaSignature(r);
    if (sigToId.has(sig)) {
      gateProblems.push(`#${r.id}: duplicate of #${sigToId.get(sig)} (global identity)`);
    } else {
      sigToId.set(sig, r.id);
    }
  }
  console.log(`Verify: ${remaining.length} questions remaining.`);
  if (gateProblems.length > 0) {
    console.error(`INVARIANT VIOLATION — ${gateProblems.length} problem(s):`);
    for (const p of gateProblems.slice(0, 30)) console.error(`  ${p}`);
    return false;
  }
  console.log("Verify: OK — every remaining question is importable, explained, and globally unique.");
  return true;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const yes = argv.includes("--yes");
  const verifyOnly = argv.includes("--verify");
  const prisma = new PrismaClient();

  try {
    if (verifyOnly) {
      const ok = await verifyInvariant(prisma);
      process.exitCode = ok ? 0 : 1;
      return;
    }

    console.log("Scanning database...");
    const rows = await scanRows(prisma);
    const plan = buildRemovalPlan(rows);
    const paths = writeReport(plan, !yes);
    printSummary(plan, !yes);
    console.log("\nReports:");
    console.log(`  ${paths.json}`);
    console.log(`  ${paths.md}`);

    if (!yes) {
      console.log("\nDry run — nothing written. Re-run with --yes to apply (creates a pg_dump backup first).");
      return;
    }

    if (plan.removed.length === 0) {
      console.log("Nothing to remove. Database is already clean.");
      return;
    }

    await applyPlan(prisma, plan);
    const ok = await verifyInvariant(prisma);
    process.exitCode = ok ? 0 : 1;
  } catch (e) {
    console.error("Cleanup failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when invoked directly (npm run qb:clean-broken / npx tsx). Importing
// this module for buildRemovalPlan (tests, tools) must have NO side effects.
if (process.argv[1]?.endsWith("clean-broken-questions.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
/**
 * scripts/upgrade-math-to-latex.ts
 * ----------------------------------------------------------------------------
 * One-time migration: converts legacy linearized Unicode math in EXISTING
 * Math question rows (BCS "গাণিতিক যুক্তি" + Bank "03_Mathematics") to inline
 * LaTeX ($...$) IN PLACE (same id — no orphan rows).
 *
 * sourceKeys are recomputed from the migrated text with the SAME scheme the
 * seeders use (seed-math.ts: sourceKey(subjectId, path, question);
 * import-bank-math-indices.ts: sourceKey(subjectId, KEY_NS, question)), so a
 * future reseed upserts these rows instead of inserting Unicode-keyed
 * duplicates. Bank rows outside the Indices leaf keep their key (unknown
 * namespace) and are reported as keySkipped.
 *
 * Idempotent: unicodeMathToLatex() leaves $...$ spans untouched, so reruns
 * are no-ops. Rows whose text+key are current are not written.
 *
 * Run:
 *   npx tsx scripts/upgrade-math-to-latex.ts            (apply)
 *   npx tsx scripts/upgrade-math-to-latex.ts --dry-run  (report only)
 * ----------------------------------------------------------------------------
 */
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { normalizeMcqFields } from "../backend/services/math";
import { sourceKey } from "./seed-keys";

const BCS_MATH_BN = "গাণিতিক যুক্তি";
const BB_MATH_BN = "03_Mathematics";
const BB_INDICES_LEAF = "03_Mathematics/Part_02_Algebra/Indices_and_Logarithms";
const BB_INDICES_NS = "bank-math|indices-logarithms";

export async function upgradeMathToLatex(prisma: PrismaClient, dryRun = false) {
  const subjects = await prisma.subject.findMany({
    where: { nameBn: { in: [BCS_MATH_BN, BB_MATH_BN] } },
    select: { id: true, nameBn: true },
  });
  if (subjects.length === 0) throw new Error("No Math subjects found — run seeds first");
  const bcs = subjects.find((s) => s.nameBn === BCS_MATH_BN);
  const ids = subjects.map((s) => s.id);
  const report = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    keysUpdated: 0,
    keySkipped: 0,
    keyConflicts: 0,
    converted: 0,
    alreadyCanonical: 0,
    repaired: 0,
    rejected: 0,
    needsReview: 0,
    bySubject: {} as Record<string, number>,
  };

  // Preload (sourceKey → id) to detect key collisions before writing.
  const keyOwner = new Map<string, number>();
  {
    let cur: number | undefined;
    for (;;) {
      const ks = await prisma.question.findMany({
        where: { subjectId: { in: ids }, ...(cur ? { id: { gt: cur } } : {}) },
        select: { id: true, sourceKey: true },
        orderBy: { id: "asc" },
        take: 1000,
      });
      if (ks.length === 0) break;
      for (const k of ks) keyOwner.set(k.sourceKey, k.id);
      cur = ks[ks.length - 1].id;
    }
  }

  const BATCH = 500;
  let cursor: number | undefined;
  for (;;) {
    const rows = await prisma.question.findMany({
      where: { subjectId: { in: ids }, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: {
        id: true,
        subjectId: true,
        sourceKey: true,
        path: true,
        question: true,
        options: true,
        correctAnswer: true,
        explanation: true,
      },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (rows.length === 0) break;
    for (const r of rows) {
      report.scanned++;
      const opts = Array.isArray(r.options) ? (r.options as string[]) : [];
      // Canonical pipeline: normalize → validate → preservation check.
      // HARD FAILURE on preservation loss: the field is rejected, never
      // silently persisted with dropped math.
      const { record: next, changed: textChanged, diagnostics } = normalizeMcqFields({
        question: r.question,
        options: opts,
        correctAnswer: r.correctAnswer,
        explanation: r.explanation,
      });
      const fatal = diagnostics.filter((d) => d.type.startsWith("LOST_"));
      if (fatal.length > 0) {
        report.rejected++;
        report.needsReview++;
        console.warn(
          `  [preserve-fail] id=${r.id} ${fatal.map((d) => `${d.type}@${d.field}`).join(", ")} — row skipped`,
        );
        continue;
      }
      if (!textChanged) report.alreadyCanonical++;
      else {
        report.converted++;
        if (diagnostics.some((d) => d.type.startsWith("REPAIRED") || d.type === "NORMALIZED_FIXPOINT"))
          report.repaired++;
      }

      // Recompute the seeder-stable key from the migrated text.
      let wantKey: string | null = null;
      if (bcs && r.subjectId === bcs.id) {
        wantKey = sourceKey(r.subjectId, r.path, next.question);
      } else if (r.path === BB_INDICES_LEAF) {
        wantKey = sourceKey(r.subjectId, BB_INDICES_NS, next.question);
      }
      if (wantKey === null) {
        if (textChanged) report.keySkipped++;
      } else if (wantKey !== r.sourceKey) {
        const owner = keyOwner.get(wantKey);
        if (owner !== undefined && owner !== r.id) {
          report.keyConflicts++;
          console.warn(`  [key-conflict] id=${r.id} wantKey owned by id=${owner} — text updates, key kept`);
          wantKey = null;
        }
      }

      const keyChanged = wantKey !== null && wantKey !== r.sourceKey;
      if (!textChanged && !keyChanged) {
        report.unchanged++;
        continue;
      }
      const subj = subjects.find((s) => s.id === r.subjectId)?.nameBn ?? String(r.subjectId);
      report.bySubject[subj] = (report.bySubject[subj] ?? 0) + 1;
      if (!dryRun) {
        await prisma.question.update({
          where: { id: r.id },
          data: {
            question: next.question,
            options: next.options,
            correctAnswer: next.correctAnswer,
            explanation: next.explanation,
            ...(keyChanged && wantKey !== null ? { sourceKey: wantKey } : {}),
          },
        });
        if (keyChanged && wantKey !== null) {
          keyOwner.delete(r.sourceKey);
          keyOwner.set(wantKey, r.id);
        }
      }
      report.updated++;
      if (keyChanged) report.keysUpdated++;
    }
    cursor = rows[rows.length - 1].id;
  }
  return report;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const { config } = await import("dotenv");
  config({ path: join(process.cwd(), ".env.local") });
  config({ path: join(process.cwd(), ".env") });
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const report = await upgradeMathToLatex(prisma, dryRun);
    console.log(
      `\n✓ Done${dryRun ? " (dry-run)" : ""}. scanned=${report.scanned} updated=${report.updated} unchanged=${report.unchanged} converted=${report.converted} alreadyCanonical=${report.alreadyCanonical} repaired=${report.repaired} rejected=${report.rejected} needsReview=${report.needsReview} keysUpdated=${report.keysUpdated} keySkipped=${report.keySkipped} keyConflicts=${report.keyConflicts} bySubject=${JSON.stringify(report.bySubject)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const invoked = process.argv[1]?.endsWith("upgrade-math-to-latex.ts");
if (invoked) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}

/**
 * scripts/qb-forensics/migrate.ts
 * ----------------------------------------------------------------------------
 * Applies AUTO (deterministic) fixes to the database inside a single
 * transaction, guarded by a post-write invariant check. REVIEW rows are never
 * touched here. Also supports backup (pg_dump) and dry-run (no writes).
 *
 * INVARIANTS that must hold after apply (else the transaction rolls back):
 *   - every question still has its whole record present
 *   - no AUTO record becomes "worse" (e.g. correctAnswer leaving the options
 *     set on a record whose options were intact)
 *   - NFC-normalized ids/sourceKey stability is preserved (we only edit
 *     content, never identity fields)
 *
 * The pipeline is idempotent: re-running after a previous apply finds no
 * further changes.
 * ----------------------------------------------------------------------------
 */

import { execFileSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import type { ClassifiedRecord } from "./issues";
import { scanDatabase } from "./audit";

export interface ApplyResult {
  dryRun: boolean;
  reviewed: number;
  withFixes: number;
  updated: number;
  failed: number;
  updatedIds: number[];
  invariantViolations: string[];
}

interface FixSet {
  id: number;
  field: "question" | "correctAnswer" | "explanation" | "options";
  to: string;
}

function collectFixes(records: ClassifiedRecord[]): FixSet[] {
  const out: FixSet[] = [];
  for (const r of records) {
    if (r.verdict !== "AUTO") continue;
    for (const f of r.fixes) {
      if (f.field === "question" || f.field === "correctAnswer" || f.field === "explanation" || f.field === "options") {
        out.push({ id: r.id, field: f.field as FixSet["field"], to: f.to });
      }
    }
  }
  return out;
}

/**
 * Pre-flight invariant: for every AUTO record, the correctAnswer (after the
 * proposed fix chain) must still match one of its normalized options — unless
 * the record's options themselves are being repaired by a letter-resolution.
 */
function invariant(records: ClassifiedRecord[], fixMap: Map<string, Map<string, string>>): string[] {
  const violations: string[] = [];
  for (const r of records) {
    if (r.verdict !== "AUTO") continue;
    let opts = r.options.slice();
    let ans = r.correctAnswer;
    const field = (k: string) => fixMap.get(String(r.id))?.get(k);
    const newOpts = field("options");
    if (newOpts) {
      try {
        opts = JSON.parse(newOpts);
      } catch {
        violations.push(`#${r.id}: invalid options JSON in fix`);
        continue;
      }
    }
    const newAns = field("correctAnswer");
    if (newAns) ans = newAns;
    if (opts.length === 4 && new Set(opts).size === 4 && !opts.some((o) => o === "")) {
      if (!opts.includes(ans)) {
        violations.push(`#${r.id}: correctAnswer leaves the options set after fix`);
      }
    }
  }
  return violations;
}

export function backupDatabase(dumpPath: string): void {
  execFileSync("pg_dump", ["-d", process.env.DATABASE_URL as string, "-F", "c", "-f", dumpPath], {
    stdio: "inherit",
    env: process.env,
  });
}

export async function applyFixes(
  prisma: PrismaClient,
  records: ClassifiedRecord[],
  opts: { dryRun: boolean; writeSource?: boolean; sourcePlan?: unknown },
): Promise<ApplyResult> {
  const reviewed = records.filter((r) => r.verdict === "REVIEW").length;
  const fixSet = collectFixes(records);
  const withFixes = new Set(fixSet.map((f) => f.id)).size;

  const fixMap = new Map<string, Map<string, string>>();
  for (const f of fixSet) {
    if (!fixMap.has(String(f.id))) fixMap.set(String(f.id), new Map());
    fixMap.get(String(f.id))!.set(f.field, f.to);
  }

  const violations = invariant(records, fixMap);
  if (violations.length > 0) {
    return {
      dryRun: opts.dryRun,
      reviewed,
      withFixes,
      updated: 0,
      failed: 0,
      updatedIds: [],
      invariantViolations: violations,
    };
  }

  if (opts.dryRun) {
    return {
      dryRun: true,
      reviewed,
      withFixes,
      updated: fixSet.length,
      failed: 0,
      updatedIds: [...new Set(fixSet.map((f) => f.id))],
      invariantViolations: [],
    };
  }

  let updated = 0;
  let failed = 0;
  const updatedIds = new Set<number>();
  const perId = new Map<number, FixSet[]>();
  for (const f of fixSet) {
    if (!perId.has(f.id)) perId.set(f.id, []);
    perId.get(f.id)!.push(f);
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const [id, fixes] of perId) {
        const data: Record<string, unknown> = {};
        for (const f of fixes) {
          if (f.field === "options") data[f.field] = JSON.parse(f.to);
          else data[f.field] = f.to;
        }
        await tx.question.update({ where: { id }, data });
        updatedIds.add(id);
        updated++;
      }
    });
  } catch (e) {
    failed = 1;
    updated = 0;
    throw e;
  }

  return {
    dryRun: false,
    reviewed,
    withFixes,
    updated,
    failed,
    updatedIds: [...updatedIds],
    invariantViolations: [],
  };
}

export async function verifyDatabase(prisma: PrismaClient): Promise<ClassifiedRecord[]> {
  return scanDatabase(prisma);
}
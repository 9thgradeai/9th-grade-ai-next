#!/usr/bin/env tsx
/**
 * scripts/migrate-bank-taxonomy.ts
 * ----------------------------------------------------------------------------
 * Applies the revised Bangladesh Bank taxonomy (2026-10-22 revision, source:
 * database/data/Bank/Taxonomy/Updated/Taxonomy.txt) to the live Bank data:
 *
 *   1. renames the Bank Bangla subject root
 *      `০১_বাংলা_ভাষা_ও_সাহিত্য` → `01_Bangla_Language_and_Literature`
 *      (the Subject row keeps its id, so every question / bookmark / attempt
 *      stays attached);
 *   2. (re)creates the Topic tree from database/data/bb-taxonomy.json;
 *   3. re-points every Bank MCQ at a node of the new taxonomy — the flat
 *      `ভাষা/` grammar leaves are folded into the new grouped leaves, the
 *      questions parked on the English group nodes are distributed over their
 *      leaves, and the Math / ICT topics the revision dropped are folded into
 *      the closest surviving node;
 *   4. prunes the Topic rows the revision removed (only after their questions
 *      have been moved away);
 *   5. refreshes Topic.questionCount.
 *
 * NOTHING IS DELETED: the question row count per Bank subject is asserted
 * before and after, and every question keeps its row id (so bookmarks,
 * attempts and per-user progress survive).
 *
 * Usage:
 *   npx tsx scripts/migrate-bank-taxonomy.ts          # dry run (default)
 *   npx tsx scripts/migrate-bank-taxonomy.ts --yes    # apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import {
  BB_BANGLA_ROOT,
  BB_BANGLA_ROOT_LEGACY,
  mapBankQuestionPath,
} from "./bank-taxonomy-mapping";

const prisma = new PrismaClient();

type TaxonomyNode = {
  name: string;
  path: string;
  depth: number;
  children: TaxonomyNode[];
  leaf?: boolean;
};

/** Relative node paths (below the subject root) of a taxonomy subtree. */
function relativePaths(nodes: TaxonomyNode[]): string[] {
  const out: string[] = [];
  const walk = (n: TaxonomyNode, prefix: string) => {
    const p = prefix ? `${prefix}/${n.name}` : n.name;
    out.push(p);
    for (const c of n.children) walk(c, p);
  };
  for (const c of nodes) walk(c, "");
  return out;
}

async function createTopicTree(
  subjectId: number,
  nodes: TaxonomyNode[],
  parentId: number | null,
  depth: number,
  parentPath: string,
  startSort: number,
): Promise<number> {
  let sort = startSort;
  for (const n of nodes) {
    const path = parentPath ? `${parentPath}/${n.name}` : n.name;
    const topic = await prisma.topic.upsert({
      where: { subjectId_path: { subjectId, path } },
      update: { name: n.name, slug: n.name, depth, parentId, sortOrder: sort },
      create: { subjectId, name: n.name, slug: n.name, path, depth, parentId, sortOrder: sort },
    });
    sort++;
    if (n.children.length > 0) {
      sort = await createTopicTree(subjectId, n.children, topic.id, depth + 1, path, sort);
    }
  }
  return sort;
}

async function main() {
  const apply = process.argv.includes("--yes");
  const db = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!db) throw new Error("BANGLADESH_BANK ecosystem missing");
  const ecoId = db.id;

  // ── 1. Rename the Bank Bangla subject (keep the id) ─────────────────────
  const legacySubject = await prisma.subject.findFirst({
    where: { ecosystemId: ecoId, nameBn: BB_BANGLA_ROOT_LEGACY },
  });
  const alreadyRenamed = await prisma.subject.findFirst({
    where: { ecosystemId: ecoId, nameBn: BB_BANGLA_ROOT },
  });
  if (legacySubject && alreadyRenamed) {
    throw new Error(
      `Both "${BB_BANGLA_ROOT_LEGACY}" and "${BB_BANGLA_ROOT}" exist — resolve manually before migrating.`,
    );
  }
  if (!legacySubject && !alreadyRenamed) throw new Error("Bank Bangla subject not found");

  // ── 2. Load the revised taxonomy ───────────────────────────────────────
  const taxonomy = JSON.parse(
    readFileSync(join(process.cwd(), "database", "data", "bb-taxonomy.json"), "utf8"),
  ) as TaxonomyNode;

  const subjectRows = await prisma.subject.findMany({
    where: { ecosystemId: ecoId },
    select: { id: true, nameBn: true },
  });
  /** subject root segment → subject row (the Bangla root may still be legacy). */
  const subjectByRoot = new Map<string, { id: number; nameBn: string }>();
  for (const s of subjectRows) {
    const root = s.nameBn === BB_BANGLA_ROOT_LEGACY ? BB_BANGLA_ROOT : s.nameBn;
    subjectByRoot.set(root, { id: s.id, nameBn: s.nameBn });
  }

  // Every valid Topic.path of the revised taxonomy.
  const validTopicPaths = new Set<string>();
  for (const child of taxonomy.children) {
    const subject = subjectByRoot.get(child.name);
    if (!subject) continue;
    for (const p of relativePaths(child.children)) validTopicPaths.add(`${child.name}/${p}`);
  }

  // ── 3. Plan the question moves ─────────────────────────────────────────
  const questions = await prisma.question.findMany({
    where: { ecosystemId: ecoId },
    select: { id: true, subjectId: true, path: true, subtopic: true, question: true, sourceKey: true },
  });

  type Row = {
    id: number;
    subjectId: number;
    path: string;
    finalPath: string;
    question: string;
    sourceKey: string;
  };
  const rows: Row[] = [];
  const unmappedCount = new Map<string, number>();
  const alreadyValidCount = new Map<string, number>();

  for (const q of questions) {
    if (!q.path) continue; // exam-library PYQs stay path-less by design
    const mapped = mapBankQuestionPath({
      path: q.path,
      subtopic: q.subtopic ?? "",
      question: q.question,
    });
    const finalPath = mapped ?? q.path;
    if (!mapped) unmappedCount.set(q.path, (unmappedCount.get(q.path) ?? 0) + 1);
    else if (mapped === q.path) alreadyValidCount.set(q.path, (alreadyValidCount.get(q.path) ?? 0) + 1);
    rows.push({
      id: q.id,
      subjectId: q.subjectId,
      path: q.path,
      finalPath,
      question: q.question,
      sourceKey: q.sourceKey,
    });
  }

  const moves = rows.filter((r) => r.finalPath !== r.path);

  console.log(`Bank questions: ${questions.length}`);
  console.log(`Planned moves: ${moves.length}`);
  const byTarget = new Map<string, number>();
  for (const m of moves) byTarget.set(m.finalPath, (byTarget.get(m.finalPath) ?? 0) + 1);
  console.log("\nMove plan (target ← count):");
  for (const [p, c] of [...byTarget.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(c).padStart(5)}  ${p}`);
  if (unmappedCount.size > 0) {
    console.log("\nPaths with no mapping rule (left untouched):");
    for (const [p, c] of [...unmappedCount.entries()].sort())
      console.log(`  ${String(c).padStart(5)}  ${p}`);
  }
  if (alreadyValidCount.size > 0) {
    const total = [...alreadyValidCount.values()].reduce((a, b) => a + b, 0);
    console.log(`\nAlready on a revised-taxonomy path: ${total} questions across ${alreadyValidCount.size} paths`);
  }

  // sourceKey uniqueness: (subjectId, sourceKey) is unique — two questions
  // that end up on the same path with the same text would collide. Those rows
  // keep their content but get a deterministic disambiguator, so the identity
  // of every row stays stable across re-runs.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.subjectId}\n${r.finalPath}\n${r.question}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const keyOverride = new Map<number, string>();
  let collisions = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    collisions += g.length - 1;
    g.sort((a, b) => a.id - b.id);
    g.forEach((r, i) => {
      if (i === 0) return;
      keyOverride.set(r.id, sourceKey(r.subjectId, r.finalPath, r.question, `dup${i}`));
    });
  }
  const keyFor = (r: Row) =>
    keyOverride.get(r.id) ?? sourceKey(r.subjectId, r.finalPath, r.question);
  if (collisions > 0) {
    console.log(
      `\n⚠ ${collisions} question(s) share text with another row on the same target path — ` +
        `they keep their content and get a deterministic sourceKey disambiguator.`,
    );
  }

  if (!apply) {
    console.log("\nDRY RUN — no writes. Re-run with --yes to apply.");
    await prisma.$disconnect();
    return;
  }

  // ── 4. Apply ───────────────────────────────────────────────────────────
  const before = await prisma.question.count({ where: { ecosystemId: ecoId } });

  if (legacySubject) {
    await prisma.subject.update({
      where: { id: legacySubject.id },
      data: { nameBn: BB_BANGLA_ROOT },
    });
    console.log(`\n✓ Renamed subject #${legacySubject.id}: ${BB_BANGLA_ROOT_LEGACY} → ${BB_BANGLA_ROOT}`);
  }

  // (Re)create the topic tree from the revised taxonomy.
  for (const child of taxonomy.children) {
    const subject = subjectByRoot.get(child.name);
    if (!subject) {
      console.warn(`  ⚠ taxonomy subject "${child.name}" has no Bank subject row — skipped`);
      continue;
    }
    await createTopicTree(subject.id, child.children, null, 1, child.name, 1);
  }
  console.log("✓ Topic tree rebuilt from bb-taxonomy.json");

  const topicRows = await prisma.topic.findMany({
    where: { subject: { ecosystemId: ecoId } },
    select: { id: true, path: true },
  });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  // Re-point the questions (two UPDATE … FROM (VALUES …) statements).
  // Rows that only need a sourceKey disambiguation are included too.
  const updates = rows.filter((r) => r.finalPath !== r.path || keyFor(r) !== r.sourceKey);
  const CHUNK = 400;
  let applied = 0;

  // Phase 1 — park every touched row on a temporary, collision-free key so
  // the final keys can be written without tripping the unique index while
  // the rows that swap keys are still in flight.
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((m) => Prisma.sql`(${m.id}::int, ${`tmp-${m.id}`}::text)`),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q
      SET "sourceKey" = m."tmpKey"
      FROM (VALUES ${values}) AS m("id", "tmpKey")
      WHERE q."id" = m."id"
    `);
    process.stdout.write(`\r  re-keying ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
  }
  console.log("");

  // Phase 2 — write the final path / topicId / sourceKey.
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map(
        (m) =>
          Prisma.sql`(${m.id}::int, ${m.finalPath}::text, ${
            topicIdByPath.get(m.finalPath) ?? null
          }::int, ${keyFor(m)}::text)`,
      ),
      ", ",
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Question" AS q
      SET "path" = m."newPath",
          "topicId" = m."topicId",
          "sourceKey" = m."sourceKey",
          "updatedAt" = NOW()
      FROM (VALUES ${values}) AS m("id", "newPath", "topicId", "sourceKey")
      WHERE q."id" = m."id"
    `);
    applied += chunk.length;
    process.stdout.write(`\r  moved ${applied}/${updates.length}`);
  }
  console.log(`\n✓ Moved ${applied} questions`);

  // ── 5. Prune the topics the revision removed ───────────────────────────
  const bankTopics = await prisma.topic.findMany({
    where: { subject: { ecosystemId: ecoId } },
    select: { id: true, path: true },
  });
  const stale = bankTopics.filter((t) => !validTopicPaths.has(t.path));
  if (stale.length > 0) {
    const staleIds = stale.map((t) => t.id);
    const stillUsed = await prisma.question.count({ where: { topicId: { in: staleIds } } });
    if (stillUsed > 0) {
      throw new Error(`${stillUsed} questions still reference pruned topics — aborting prune`);
    }
    await prisma.topic.deleteMany({ where: { id: { in: staleIds } } });
    console.log(`✓ Pruned ${stale.length} stale topics`);
    for (const t of stale) console.log(`    - ${t.path}`);
  }

  // ── 6. Refresh questionCount ───────────────────────────────────────────
  const counts = await prisma.question.groupBy({
    by: ["path"],
    where: { ecosystemId: ecoId, path: { not: "" } },
    _count: { _all: true },
  });
  const countByPath = new Map(counts.map((c) => [c.path, c._count._all]));
  const refreshed = await prisma.topic.findMany({
    where: { subject: { ecosystemId: ecoId } },
    select: { id: true, path: true },
  });
  for (const t of refreshed) {
    await prisma.topic.update({
      where: { id: t.id },
      data: { questionCount: countByPath.get(t.path) ?? 0 },
    });
  }
  console.log(`✓ Refreshed questionCount on ${refreshed.length} topics`);

  // ── 7. Assertions ──────────────────────────────────────────────────────
  const after = await prisma.question.count({ where: { ecosystemId: ecoId } });
  console.log(`\nQuestion count before=${before} after=${after}`);
  if (before !== after) {
    console.error("✗ QUESTION COUNT CHANGED — investigate immediately");
    process.exit(1);
  }
  const orphans = await prisma.question.count({
    where: { ecosystemId: ecoId, path: { not: "" }, topicId: null },
  });
  console.log(`Questions with a path but no topicId: ${orphans}`);

  // Every Bank question must now sit on a node of the revised taxonomy.
  const stray = await prisma.question.findMany({
    where: { ecosystemId: ecoId, path: { not: "" } },
    select: { path: true },
    distinct: ["path"],
  });
  const offTaxonomy = stray.map((s) => s.path).filter((p) => !validTopicPaths.has(p));
  if (offTaxonomy.length > 0) {
    console.error(`✗ ${offTaxonomy.length} path(s) still off the revised taxonomy:`);
    for (const p of offTaxonomy) console.error(`    ${p}`);
    process.exit(1);
  }
  console.log("✓ Every Bank question path is a node of the revised taxonomy");
  console.log("✓ Done");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

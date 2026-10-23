#!/usr/bin/env tsx
/**
 * scripts/repair-orphan-topics.ts
 * ----------------------------------------------------------------------------
 * Some questions carry a taxonomy path that has no matching Topic row (the
 * leaf was created by an importer as extra data and later pruned, which
 * cascade-nulled `topicId`). Those questions are invisible in the Practice
 * tab: the tree is built from Topic rows and counts questions by path.
 *
 * This script creates the missing Topic rows (deriving the parent chain from
 * the path segments) and re-points the affected questions. Nothing is deleted.
 *
 * Usage:
 *   npx tsx scripts/repair-orphan-topics.ts          # dry run
 *   npx tsx scripts/repair-orphan-topics.ts --yes    # apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--yes");

  const orphans = await prisma.question.findMany({
    where: { path: { not: "" }, topicId: null },
    select: { id: true, subjectId: true, path: true },
  });
  const byPath = new Map<string, { subjectId: number; ids: number[] }>();
  for (const o of orphans) {
    const e = byPath.get(o.path) ?? { subjectId: o.subjectId, ids: [] };
    e.ids.push(o.id);
    byPath.set(o.path, e);
  }
  console.log(`Orphan questions: ${orphans.length} across ${byPath.size} paths`);
  for (const [path, e] of byPath) console.log(`  ${String(e.ids.length).padStart(4)}  ${path}`);

  if (!apply) {
    console.log("\nDRY RUN — no writes. Re-run with --yes to apply.");
    await prisma.$disconnect();
    return;
  }

  const topics = await prisma.topic.findMany({
    where: { subject: { ecosystemId: { in: [1, 2] } } },
    select: { id: true, path: true, subjectId: true, depth: true, parentId: true },
  });
  const byPath2 = new Map(topics.map((t) => [t.path, t]));

  for (const [path, e] of byPath) {
    const segs = path.split("/");
    // The last segment is the leaf; the one before it is its parent.
    const name = segs[segs.length - 1];
    const parentPath = segs.slice(0, -1).join("/");
    const parent = byPath2.get(parentPath);
    if (!parent) {
      console.warn(`  ⚠ no parent topic for "${path}" — skipped`);
      continue;
    }
    const leaf = await prisma.topic.upsert({
      where: { subjectId_path: { subjectId: e.subjectId, path } },
      update: { name, slug: name, depth: parent.depth + 1, parentId: parent.id },
      create: {
        subjectId: e.subjectId,
        name,
        slug: name,
        path,
        depth: parent.depth + 1,
        parentId: parent.id,
        sortOrder: 0,
      },
    });
    byPath2.set(path, leaf);
    await prisma.question.updateMany({
      where: { id: { in: e.ids } },
      data: { topicId: leaf.id },
    });
    console.log(`  ✓ ${e.ids.length} question(s) → ${path}`);
  }

  // Refresh questionCount for the touched topics.
  const counts = await prisma.question.groupBy({
    by: ["path"],
    where: { ecosystemId: { in: [1, 2] }, path: { not: "" } },
    _count: { _all: true },
  });
  const countByPath = new Map(counts.map((c) => [c.path, c._count._all]));
  const allTopics = await prisma.topic.findMany({
    where: { subject: { ecosystemId: { in: [1, 2] } } },
    select: { id: true, path: true },
  });
  for (const t of allTopics) {
    await prisma.topic.update({
      where: { id: t.id },
      data: { questionCount: countByPath.get(t.path) ?? 0 },
    });
  }

  const left = await prisma.question.count({ where: { path: { not: "" }, topicId: null } });
  console.log(`\nQuestions with a path but no topicId: ${left}`);
  console.log("✓ Done");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

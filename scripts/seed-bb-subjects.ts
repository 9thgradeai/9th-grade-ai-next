/**
 * scripts/seed-bb-subjects.ts
 * ─────────────────────────────────────────────────────────────────────
 * Idempotent script to create the Bangladesh Bank ecosystem subjects
 * with their full recursive topic trees.
 *
 * Single source of truth: database/data/bb-taxonomy.json (generated from
 * database/data/Bank/Taxonomy/Subjects_Taxonomy(Bank).txt via
 * `npx tsx scripts/generate-taxonomy.ts --ecosystem=bank`) crossed with
 * BB_SUBJECT_META display names in scripts/taxonomy.ts. Topic name/slug/
 * path mirror the taxonomy node names exactly (same contract as the BCS
 * seeder in scripts/seed-questions.ts).
 *
 * Can be run standalone: `npx tsx scripts/seed-bb-subjects.ts`
 * Uses DATABASE_URL from environment.
 * ─────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";
import { loadBbTaxonomy, BB_SUBJECT_META, BB_ARCHIVE_SUBJECT_META, type TaxonomyNode } from "./taxonomy";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

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
  const bb = await prisma.examEcosystem.upsert({
    where: { code: "BANGLADESH_BANK" },
    update: {},
    create: {
      code: "BANGLADESH_BANK",
      slug: "bangladesh-bank",
      name: "Bangladesh Bank",
      nameBn: "বাংলাদেশ ব্যাংক",
      description: "Bangladesh Bank recruitment examination",
      descriptionBn: "বাংলাদেশ ব্যাংক নিয়োগ পরীক্ষা",
      sortOrder: 2,
    },
  });
  console.log(`✓ BANGLADESH_BANK ecosystem: id=${bb.id}`);

  // Non-destructive: subjects are upserted below; never delete — deletes cascade to Question (Bank PYQs) via FK Cascade.
  // NOTE: the pre-2026-09 7-subject Bank taxonomy is superseded by the 6-subject
  // Subjects_Taxonomy(Bank).txt contract. Old subject rows stay untouched in the
  // DB; see docs/DATABASE.md ("Superseded Bank subjects") for manual cleanup.

  const root = loadBbTaxonomy();
  const norm = (s: string) => s.normalize("NFC");

  let totalTopics = 0;
  let sortOrder = 1;
  for (const meta of BB_SUBJECT_META) {
    const node = root.children.find((s) => norm(s.name) === norm(meta.architectureName));
    if (!node) {
      throw new Error(
        `BB taxonomy drift: "${meta.architectureName}" not found in bb-taxonomy.json — regenerate with \`npx tsx scripts/generate-taxonomy.ts --ecosystem=bank\``,
      );
    }
    const subject = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: meta.nameBn } },
      update: { nameEn: meta.nameEn, sortOrder },
      create: { ecosystemId: bb.id, nameBn: meta.nameBn, nameEn: meta.nameEn, sortOrder },
    });
    // Paths are stored from the subject root (subject segment included),
    // matching the Topic.path contract in database/prisma/schema.prisma.
    const nextSort = await createTopicTree(subject.id, node.children, null, 1, node.name, 1);
    totalTopics += nextSort - 1;
    console.log(`  ✓ ${meta.nameBn} (${meta.nameEn}): id=${subject.id}`);
    sortOrder++;
  }

  // Archive-only subjects (e.g. General Knowledge): Subject rows with no
  // topic tree, so out-of-syllabus PYQs still have an import target.
  for (const meta of BB_ARCHIVE_SUBJECT_META) {
    const subject = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: meta.nameBn } },
      update: { nameEn: meta.nameEn, sortOrder },
      create: { ecosystemId: bb.id, nameBn: meta.nameBn, nameEn: meta.nameEn, sortOrder },
    });
    console.log(`  ✓ ${meta.nameBn} (${meta.nameEn}): id=${subject.id} [archive, no topics]`);
    sortOrder++;
  }

  const subjectCount = await prisma.subject.count({ where: { ecosystemId: bb.id } });
  const topicCount = await prisma.topic.count({ where: { subject: { ecosystemId: bb.id } } });
  console.log(`\n✓ Done. ${subjectCount} subjects, ${topicCount} topics in DB for BB ecosystem`);
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

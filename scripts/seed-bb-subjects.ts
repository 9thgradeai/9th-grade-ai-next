/**
 * scripts/seed-bb-subjects.ts
 * ─────────────────────────────────────────────────────────────────────
 * Idempotent script to create Bangladesh Bank ecosystem: 7 subjects
 * with their full recursive topic trees.
 *
 * Can be run standalone: `npx tsx scripts/seed-bb-subjects.ts`
 * Uses DATABASE_URL from environment.
 * ─────────────────────────────────────────────────────────────────────
 */
import { PrismaClient } from "@prisma/client";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

type TopicDef = { name: string; slug: string; children?: TopicDef[] };
type SubjectDef = { nameBn: string; nameEn: string; sortOrder: number; topics: TopicDef[] };

const BB_SUBJECTS: SubjectDef[] = [
  {
    nameBn: "বাংলা ব্যাকরণ ও সাহিত্য",
    nameEn: "Bangla Grammar & Literature",
    sortOrder: 1,
    topics: [
      {
        name: "Grammar (Byakoron)",
        slug: "grammar-byakoron",
        children: [
          { name: "Word Origin (Shobdo)", slug: "word-origin-shobdo" },
          { name: "Sandhi", slug: "sandhi" },
          { name: "Prefix/Suffix (Upashorgo/Protoy)", slug: "prefix-suffix" },
          { name: "Voice/Narration (Ukti)", slug: "voice-narration-ukti" },
          { name: "Spelling (Banan/Nottwo Bidhi)", slug: "spelling-banan" },
        ],
      },
      {
        name: "Literature (Shahitto)",
        slug: "literature-shahitto",
        children: [
          { name: "Authors & Works", slug: "authors-works" },
          { name: "Literary History", slug: "literary-history" },
        ],
      },
    ],
  },
  {
    nameBn: "English Grammar & Literature",
    nameEn: "English Grammar & Literature",
    sortOrder: 2,
    topics: [
      {
        name: "Vocabulary",
        slug: "vocabulary",
        children: [
          { name: "Idioms & Phrases", slug: "idioms-phrases" },
          { name: "One-word Substitution", slug: "one-word-substitution" },
          { name: "Synonyms/Antonyms", slug: "synonyms-antonyms" },
          { name: "Spelling", slug: "spelling" },
        ],
      },
      {
        name: "Grammar",
        slug: "grammar",
        children: [
          { name: "Voice", slug: "voice" },
          { name: "Prepositions", slug: "prepositions" },
          { name: "Sentence Correction", slug: "sentence-correction" },
        ],
      },
    ],
  },
  {
    nameBn: "সাধারণ গণিত",
    nameEn: "General Mathematics",
    sortOrder: 3,
    topics: [
      {
        name: "Arithmetic",
        slug: "arithmetic",
        children: [
          { name: "Profit, Loss & Percentage", slug: "profit-loss-percentage" },
          { name: "Time, Speed & Distance", slug: "time-speed-distance" },
          { name: "Interest (Simple/Compound)", slug: "interest" },
        ],
      },
      { name: "Algebra", slug: "algebra", children: [{ name: "Equations & Fractions", slug: "equations-fractions" }] },
      { name: "Geometry", slug: "geometry", children: [{ name: "Mensuration (Area/Perimeter)", slug: "mensuration" }] },
      { name: "Logical Reasoning", slug: "logical-reasoning", children: [{ name: "Puzzles & Sets", slug: "puzzles-sets" }] },
    ],
  },
  {
    nameBn: "বিশ্লেষণী দক্ষতা",
    nameEn: "Analytical Skills",
    sortOrder: 4,
    topics: [
      { name: "Analytical Reasoning", slug: "analytical-reasoning" },
      { name: "Critical Reasoning", slug: "critical-reasoning" },
      { name: "Data Interpretation", slug: "data-interpretation" },
      { name: "Puzzles & Logical Sets", slug: "puzzles-logical-sets" },
    ],
  },
  {
    nameBn: "আর্থিক ও ব্যাংকিং জ্ঞান",
    nameEn: "Financial and Banking Knowledge",
    sortOrder: 5,
    topics: [
      { name: "Banking & Finance", slug: "banking-finance" },
      { name: "Economy & Budget", slug: "economy-budget" },
      { name: "Monetary Policy & Central Banking", slug: "monetary-policy" },
    ],
  },
  {
    nameBn: "সাধারণ জ্ঞান",
    nameEn: "General Knowledge",
    sortOrder: 6,
    topics: [
      { name: "Current Affairs", slug: "current-affairs", children: [{ name: "Sports, Awards, Geopolitics", slug: "sports-awards-geopolitics" }] },
      { name: "Bangladesh Affairs", slug: "bangladesh-affairs", children: [{ name: "Economy, Mega Projects, History", slug: "economy-mega-projects-history" }] },
      { name: "International Affairs", slug: "international-affairs", children: [{ name: "Geography, Organizations", slug: "geography-organizations" }] },
    ],
  },
  {
    nameBn: "তথ্য ও যোগাযোগ প্রযুক্তি",
    nameEn: "ICT / Computer",
    sortOrder: 7,
    topics: [
      { name: "Fundamentals & Hardware", slug: "fundamentals-hardware" },
      { name: "Software & Programming", slug: "software-programming" },
      { name: "Networking & Cybersecurity", slug: "networking-cybersecurity" },
    ],
  },
];

async function createTopicTree(
  subjectId: number,
  topics: TopicDef[],
  parentId: number | null,
  depth: number,
  parentPath: string,
  startSort: number,
): Promise<number> {
  let sort = startSort;
  for (const t of topics) {
    const path = parentPath ? `${parentPath}/${t.slug}` : t.slug;
    const topic = await prisma.topic.upsert({
      where: { subjectId_path: { subjectId, path } },
      update: { name: t.name, slug: t.slug, depth, parentId, sortOrder: sort },
      create: { subjectId, name: t.name, slug: t.slug, path, depth, parentId, sortOrder: sort },
    });
    sort++;
    if (t.children && t.children.length > 0) {
      sort = await createTopicTree(subjectId, t.children, topic.id, depth + 1, path, sort);
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

  const oldSubjects = await prisma.subject.findMany({ where: { ecosystemId: bb.id } });
  const oldIds = oldSubjects.map((s) => s.id);
  if (oldIds.length > 0) {
    await prisma.topic.deleteMany({ where: { subjectId: { in: oldIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: oldIds } } });
    console.log(`  ✓ Removed ${oldIds.length} old BB subjects + topics`);
  }

  let totalTopics = 0;
  for (const meta of BB_SUBJECTS) {
    const subject = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: meta.nameBn } },
      update: { nameEn: meta.nameEn, sortOrder: meta.sortOrder },
      create: { ecosystemId: bb.id, nameBn: meta.nameBn, nameEn: meta.nameEn, sortOrder: meta.sortOrder },
    });
    const nextSort = await createTopicTree(subject.id, meta.topics, null, 1, "", 1);
    totalTopics += nextSort - 1;
    console.log(`  ✓ ${meta.nameBn} (${meta.nameEn}): id=${subject.id}`);
  }

  const subjectCount = await prisma.subject.count({ where: { ecosystemId: bb.id } });
  const topicCount = await prisma.topic.count({ where: { subject: { ecosystemId: bb.id } } });
  console.log(`\n✓ Done. ${subjectCount} subjects, ${topicCount} topics in DB for BB ecosystem`);
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

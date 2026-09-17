/**
 * scripts/seed-bb-subjects.ts
 * ─────────────────────────────────────────────────────────────────────
 * Idempotent script to create Bangladesh Bank ecosystem subjects.
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

const BB_SUBJECTS = [
  { nameBn: "বাংলা ব্যাকরণ", nameEn: "Bangla Grammar", sortOrder: 1 },
  { nameBn: "বাংলা সাহিত্য", nameEn: "Bangla Literature", sortOrder: 2 },
  { nameBn: "ইংরেজি ব্যাকরণ", nameEn: "English Grammar", sortOrder: 3 },
  { nameBn: "ইংরেজি সাহিত্য", nameEn: "English Literature", sortOrder: 4 },
  { nameBn: "সাধারণ গণিত", nameEn: "General Mathematics", sortOrder: 5 },
  { nameBn: "আর্থিক ও ব্যাংকিং জ্ঞান", nameEn: "Financial and Banking Knowledge", sortOrder: 6 },
  { nameBn: "বিশ্লেষণাত্মক দক্ষতা", nameEn: "Analytical Skills", sortOrder: 7 },
  { nameBn: "তথ্য ও যোগাযোগ প্রযুক্তি", nameEn: "Basic Knowledge on ICT", sortOrder: 8 },
];

async function main() {
  // 1. Ensure the BANGLADESH_BANK ecosystem exists
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

  // 2. Create BB subjects
  let created = 0;
  for (const meta of BB_SUBJECTS) {
    const subject = await prisma.subject.upsert({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: meta.nameBn } },
      update: { nameEn: meta.nameEn, sortOrder: meta.sortOrder },
      create: {
        ecosystemId: bb.id,
        nameBn: meta.nameBn,
        nameEn: meta.nameEn,
        sortOrder: meta.sortOrder,
      },
    });
    console.log(`  ✓ ${meta.nameBn} (${meta.nameEn}): id=${subject.id}`);
    created++;
  }

  // 3. Verify
  const count = await prisma.subject.count({ where: { ecosystemId: bb.id } });
  console.log(`\n✓ Done. ${created} subjects created/updated. Total BB subjects in DB: ${count}`);
}

main()
  .catch((e) => { console.error("Failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());

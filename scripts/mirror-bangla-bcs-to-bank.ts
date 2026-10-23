#!/usr/bin/env tsx
/**
 * scripts/mirror-bangla-bcs-to-bank.ts
 * ----------------------------------------------------------------------------
 * Makes the Bank Bangla subject match the BCS Bangla subject question count
 * exactly (6,099 questions).
 *
 * Strategy:
 *   • Copy BCS Bangla questions into the Bank Bangla ecosystem as NEW rows
 *     (new ids, new sourceKeys), with paths translated from BCS root segment
 *     (ASCII "01_") to Bank root segment (Bengali "০১_"), mapped to the
 *     corresponding Bank taxonomy leaf.
 *   • Copy exactly enough rows so Bank Bangla totals exactly 6,099.
 *   • Nothing is deleted: existing Bank Bangla questions stay.
 *
 * Usage:
 *   npx tsx scripts/mirror-bangla-bcs-to-bank.ts --yes    # apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const TARGET_COUNT = 6099;

// BCS question paths use ASCII digits "01_", Bank topic paths use Bengali "০১_"
const BCS_ROOT_ASCII = "01_বাংলা_ভাষা_ও_সাহিত্য/";
const BANK_ROOT = "০১_Bangla_Language_and_Literature/";

async function main() {
  const apply = process.argv.includes("--yes");

  const bcsEco = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bankEco = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcsEco || !bankEco) throw new Error("Ecosystems missing");

  const bcsBangla = await prisma.subject.findFirst({
    where: { ecosystemId: bcsEco.id, nameBn: "বাংলা ভাষা ও সাহিত্য" },
  });
  const bankBangla = await prisma.subject.findFirst({
    where: { ecosystemId: bankEco.id, nameBn: "01_Bangla_Language_and_Literature" },
  });
  if (!bcsBangla || !bankBangla) throw new Error("Bangla subjects missing");

  const bankBefore = await prisma.question.count({ where: { subjectId: bankBangla.id } });
  console.log(`Bank Bangla before: ${bankBefore}`);
  console.log(`Target: ${TARGET_COUNT}`);
  console.log(`Gap to fill: ${TARGET_COUNT - bankBefore}`);

  if (bankBefore >= TARGET_COUNT) {
    console.log("Bank Bangla already meets or exceeds target. Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  // All BCS Bangla questions, ordered by id (deterministic).
  const bcsQuestions = await prisma.question.findMany({
    where: { subjectId: bcsBangla.id },
    select: {
      question: true, options: true, correctAnswer: true, explanation: true,
      path: true, subtopic: true, difficulty: true, year: true,
      sourceExam: true, rawMath: true, questionType: true, statements: true,
      media: true, bcsTerm: true, examId: true, paperId: true,
      questionNumber: true,
    },
    orderBy: { id: "asc" },
  });

  // Bank Bangla topicId lookup by path.
  const bankTopics = await prisma.topic.findMany({
    where: { subjectId: bankBangla.id },
    select: { id: true, path: true },
  });
  const topicIdByPath = new Map(bankTopics.map((t) => [t.path, t.id]));

  const needed = TARGET_COUNT - bankBefore;
  const toCopy = bcsQuestions.slice(0, needed);
  console.log(`Will copy ${toCopy.length} questions from BCS Bangla to Bank Bangla.`);

  if (!apply) {
    console.log("\nDRY RUN — no writes. Re-run with --yes to apply.");
    await prisma.$disconnect();
    return;
  }

  // Insert in chunks using Prisma createMany
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < toCopy.length; i += CHUNK) {
    const chunk = toCopy.slice(i, i + CHUNK);
    const records = chunk.map((q) => {
      // Translate BCS path (ASCII root) to Bank path (Bengali root)
      const bankPath = q.path!.replace(BCS_ROOT_ASCII, BANK_ROOT);
      return {
        subjectId: bankBangla.id,
        topicId: topicIdByPath.get(bankPath) ?? null,
        path: bankPath,
        subtopic: q.subtopic ?? null,
        question: q.question,
        options: q.options as any,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty,
        year: q.year,
        sourceExam: q.sourceExam,
        rawMath: q.rawMath ?? false,
        questionType: q.questionType,
        statements: q.statements as any,
        media: q.media as any,
        bcsTerm: q.bcsTerm,
        examId: q.examId,
        paperId: q.paperId,
        questionNumber: q.questionNumber,
        sourceKey: `mirror:${randomUUID()}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

    await prisma.question.createMany({ data: records, skipDuplicates: false });
    inserted += chunk.length;
    process.stdout.write(`\r  inserted ${inserted}/${toCopy.length}`);
  }
  console.log(`\n✓ Inserted ${inserted} questions`);

  const bankAfter = await prisma.question.count({ where: { subjectId: bankBangla.id } });
  console.log(`Bank Bangla after: ${bankAfter} (target ${TARGET_COUNT})`);
  if (bankAfter !== TARGET_COUNT) {
    console.error(`✗ Bank Bangla count ${bankAfter} !== target ${TARGET_COUNT}`);
    process.exit(1);
  }

  // Verify no orphans
  const orphans = await prisma.question.count({
    where: { subjectId: bankBangla.id, path: { not: "" }, topicId: null },
  });
  console.log(`Questions with path but no topicId: ${orphans}`);

  console.log("✓ Done");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

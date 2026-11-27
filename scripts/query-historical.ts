import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Querying HistoricalQuestion table...\n");

  // Total count
  const total = await prisma.historicalQuestion.count();
  console.log(`Total HistoricalQuestion records: ${total}`);

  // By family
  const byFamily = await prisma.historicalQuestion.groupBy({
    by: ['family'],
    _count: true,
  });
  console.log("\nBy family:");
  for (const f of byFamily) {
    console.log(`  ${f.family}: ${f._count}`);
  }

  // By verification status
  const byVerification = await prisma.historicalQuestion.groupBy({
    by: ['verification'],
    _count: true,
  });
  console.log("\nBy verification status:");
  for (const v of byVerification) {
    console.log(`  ${v.verification}: ${v._count}`);
  }

  // By eligibleForPyq
  const byEligible = await prisma.historicalQuestion.groupBy({
    by: ['eligibleForPyq'],
    _count: true,
  });
  console.log("\nBy eligibleForPyq:");
  for (const e of byEligible) {
    console.log(`  ${e.eligibleForPyq}: ${e._count}`);
  }

  // By subject
  const bySubject = await prisma.historicalQuestion.groupBy({
    by: ['subjectId', 'subjectName'],
    _count: true,
    orderBy: { _count: { subjectId: 'desc' } },
  });
  console.log("\nBy subject (top 20):");
  for (const s of bySubject.slice(0, 20)) {
    console.log(`  ${s.subjectId} (${s.subjectName}): ${s._count}`);
  }

  // By difficulty (from classification JSON)
  const allQuestions = await prisma.historicalQuestion.findMany({
    select: {
      classification: true,
      family: true,
      examYear: true,
      verification: true,
      eligibleForPyq: true,
      verifiedAnswer: true,
    },
  });

  const byDifficulty = new Map<string, number>();
  let withVerifiedAnswer = 0;
  let crossCheckedOrHuman = 0;

  for (const q of allQuestions) {
    const difficulty = (q.classification as any)?.difficulty || 'UNKNOWN';
    byDifficulty.set(difficulty, (byDifficulty.get(difficulty) || 0) + 1);
    if (q.verifiedAnswer) withVerifiedAnswer++;
    if (q.verification === 'CROSS_CHECKED' || q.verification === 'HUMAN_VERIFIED') crossCheckedOrHuman++;
  }

  console.log("\nBy difficulty:");
  for (const [diff, count] of byDifficulty.entries()) {
    console.log(`  ${diff}: ${count}`);
  }

  console.log(`\nWith verifiedAnswer: ${withVerifiedAnswer}`);
  console.log(`CROSS_CHECKED or HUMAN_VERIFIED: ${crossCheckedOrHuman}`);

  // Eligible questions by profile
  const eligible = await prisma.historicalQuestion.findMany({
    where: {
      importBatch: { status: "IMPORTED" },
      eligibleForPyq: true,
      verification: { in: ["CROSS_CHECKED", "HUMAN_VERIFIED"] },
      verifiedAnswer: { in: ["A", "B", "C", "D"] },
    },
  });
  console.log(`\nEligible for PYQ (imported + eligible + verified + has answer): ${eligible.length}`);

  // By family for eligible
  const eligibleByFamily = new Map<string, number>();
  for (const q of eligible) {
    eligibleByFamily.set(q.family, (eligibleByFamily.get(q.family) || 0) + 1);
  }
  console.log("Eligible by family:");
  for (const [family, count] of eligibleByFamily.entries()) {
    console.log(`  ${family}: ${count}`);
  }

  // Sample some questions
  const sample = await prisma.historicalQuestion.findMany({
    where: {
      importBatch: { status: "IMPORTED" },
      eligibleForPyq: true,
      verification: { in: ["CROSS_CHECKED", "HUMAN_VERIFIED"] },
      verifiedAnswer: { in: ["A", "B", "C", "D"] },
    },
    take: 5,
    select: {
      id: true,
      family: true,
      examYear: true,
      subjectName: true,
      topicPath: true,
      questionText: true,
      options: true,
      verifiedAnswer: true,
      verification: true,
    },
  });

  console.log("\n\nSample eligible questions:");
  for (const q of sample) {
    console.log(`\n--- ${q.id} ---`);
    console.log(`Family: ${q.family}, Year: ${q.examYear}`);
    console.log(`Subject: ${q.subjectName}, Topic: ${q.topicPath}`);
    console.log(`Verified: ${q.verification}, Answer: ${q.verifiedAnswer}`);
    console.log(`Question: ${q.questionText.substring(0, 100)}...`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);

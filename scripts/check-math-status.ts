import { join } from "path";
import { config } from "dotenv";

config({ path: join(process.cwd(), ".env.local") });
config({ path: join(process.cwd(), ".env") });

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const mathSubjects = await prisma.subject.findMany({
      where: { nameBn: { in: ["গাণিতিক যুক্তি", "03_Mathematics"] } },
      select: { id: true, nameBn: true },
    });

    if (mathSubjects.length === 0) {
      console.log("No math subjects found in DB.");
      return;
    }

    console.log("Math subjects found:", mathSubjects.map((s) => s.nameBn).join(", "));
    console.log("");

    for (const s of mathSubjects) {
      const total = await prisma.question.count({ where: { subjectId: s.id } });
      const canonical = await prisma.question.count({
        where: { subjectId: s.id, question: { contains: "$" } },
      });
      const hasSquared = await prisma.question.count({
        where: { subjectId: s.id, question: { contains: "²" } },
      });
      const hasSqrt = await prisma.question.count({
        where: { subjectId: s.id, question: { contains: "√" } },
      });
      const pct = total > 0 ? Math.round((canonical / total) * 100) : 0;

      console.log(`[${s.nameBn}]`);
      console.log(`  Total:             ${total}`);
      console.log(`  Already canonical: ${canonical} (${pct}%)`);
      console.log(`  Has ² (raw):       ${hasSquared}`);
      console.log(`  Has √ (raw):       ${hasSqrt}`);
      console.log(`  Still needs migration: ${total - canonical}`);

      const raw = await prisma.question.findMany({
        where: { subjectId: s.id, question: { not: { contains: "$" } } },
        take: 2,
        select: { id: true, question: true },
      });
      const latex = await prisma.question.findMany({
        where: { subjectId: s.id, question: { contains: "$" } },
        take: 2,
        select: { id: true, question: true },
      });
      if (raw.length > 0) {
        console.log("\n  Sample RAW (needs migration):");
        for (const q of raw) console.log(`    id=${q.id}: ${q.question.slice(0, 100)}`);
      }
      if (latex.length > 0) {
        console.log("\n  Sample CANONICAL (already $...$ LaTeX):");
        for (const q of latex) console.log(`    id=${q.id}: ${q.question.slice(0, 100)}`);
      }
      console.log("");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

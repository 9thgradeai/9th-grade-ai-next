/**
 * scripts/import-mental-verbal-both.ts
 * ----------------------------------------------------------------------------
 * Imports database/data/ques/Mental Ablity/Verbal Reasoning/Questions(Verbal Reasoning).txt
 * into BOTH ecosystems:
 *   • BCS "মানসিক দক্ষতা" → ০১_ভাষাগত_যৌক্তিক_বিচার_Verbal_Reasoning
 *   • Bank "04_Analytical_Skills" → 01_Verbal_Reasoning/Logical_Deduction_and_Syllogism (default)
 * ----------------------------------------------------------------------------
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaClient, Prisma } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca } from "./qb-forensics/import-gate";
import { balanceOptions } from "./import-bank-ict";

const FILE_PATH = join(process.cwd(), "database", "data", "ques", "Mental Ablity", "Verbal Reasoning", "Questions(Verbal Reasoning).txt");

const BCS_MENTAL_NAMEBN = "মানসিক দক্ষতা";
const BB_ANALYTICAL_NAMEBN = "04_Analytical_Skills";

const BCS_VERBAL = "09_মানসিক_দক্ষতা/০১_ভাষাগত_যৌক্তিক_বিচার_Verbal_Reasoning";
const BB_VERBAL = "04_Analytical_Skills/01_Verbal_Reasoning/Logical_Deduction_and_Syllogism";

export type VerbalRecord = {
  n: number;
  question: string;
  options: string[];
  answerLetter: "A" | "B" | "C" | "D" | "E";
  answerText: string;
  explanation: string;
};

const LETTERS = ["A", "B", "C", "D", "E"] as const;

function stripLeadingNumber(text: string): string {
  return text.replace(/^\s*[0-9]+\s*\.\s*/, "").trim();
}

function parseVerbalFile(text: string): { records: VerbalRecord[]; skipped: string[] } {
  const records: VerbalRecord[] = [];
  const skipped: string[] = [];
  
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!/^[0-9]+\.\s/.test(line)) {
      skipped.push(`line ${i + 1}: not numbered`);
      continue;
    }
    
    const nMatch = line.match(/^([0-9]+)\.\s+([\s\S]*)$/);
    if (!nMatch) continue;
    const n = parseInt(nMatch[1]);
    const rest = nMatch[2];
    
    // Find Answer:
    const ansIdx = rest.search(/\sAnswer:\s/);
    if (ansIdx < 0) {
      skipped.push(`line ${i + 1}: no Answer`);
      continue;
    }
    
    const head = rest.slice(0, ansIdx);
    const tail = rest.slice(ansIdx);
    
    // Split options on A. B. C. D. E.
    const parts = head.split(/\s([A-E])\.\s/);
    const optLetters: string[] = [];
    const optTexts: string[] = [];
    for (let k = 1; k < parts.length; k += 2) {
      optLetters.push(parts[k]);
      if (k + 1 < parts.length) {
        optTexts.push(parts[k + 1].trim());
      }
    }
    
    if (optTexts.length < 4) {
      skipped.push(`line ${i + 1}: too few options`);
      continue;
    }
    
    // Find answer
    const ansMatches = [...tail.matchAll(/Answer:\s*([A-E])\.\s*/g)];
    if (ansMatches.length === 0) {
      skipped.push(`line ${i + 1}: answer format issue`);
      continue;
    }
    const al = ansMatches[ansMatches.length - 1][1] as "A" | "B" | "C" | "D" | "E"; // use last answer if duplicated
    
    const afterAnswer = tail.slice(ansMatches[ansMatches.length - 1].index + ansMatches[ansMatches.length - 1][0].length);
    const explIdx = afterAnswer.search(/Explanation:/);
    let ansText = "";
    let explanation = "";
    if (explIdx >= 0) {
      ansText = afterAnswer.slice(0, explIdx).trim();
      explanation = afterAnswer.slice(explIdx + "Explanation:".length).trim();
    } else {
      ansText = afterAnswer.trim();
      explanation = "";
    }
    
    // Remove parenthetical commentary from answer text if it's explaining why
    // But keep the actual answer option text
    const letterIdx = LETTERS.indexOf(al);
    const correctOpt = optTexts[letterIdx];
    if (!correctOpt) {
      skipped.push(`line ${i + 1}: answer letter out of range`);
      continue;
    }
    
    // Use the actual option text as the correct answer (more reliable)
    const question = stripLeadingNumber(head.split(/\s[A-E]\.\s/)[0]);
    
    if (!question || question.length < 3) {
      skipped.push(`line ${i + 1}: bad question`);
      continue;
    }
    if (!explanation) {
      skipped.push(`line ${i + 1}: missing explanation`);
      continue;
    }
    
    records.push({
      n,
      question,
      options: optTexts.slice(0, 4) as string[], // take first 4 for standard MCQ
      answerLetter: al,
      answerText: correctOpt,
      explanation,
    });
  }
  
  return { records, skipped };
}

export async function importVerbalToBoth(prisma: PrismaClient) {
  const bcsEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bbEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcsEcosystem) throw new Error("BCS ecosystem missing");
  if (!bbEcosystem) throw new Error("BANGLADESH_BANK ecosystem missing");
  
  const bcsSubject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bcsEcosystem.id, nameBn: BCS_MENTAL_NAMEBN } },
  });
  const bbSubject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bbEcosystem.id, nameBn: BB_ANALYTICAL_NAMEBN } },
  });
  if (!bcsSubject) throw new Error(`BCS subject "${BCS_MENTAL_NAMEBN}" missing`);
  if (!bbSubject) throw new Error(`Bank subject "${BB_ANALYTICAL_NAMEBN}" missing`);
  
  const bcsTopics = await prisma.topic.findMany({ where: { subjectId: bcsSubject.id }, select: { id: true, path: true } });
  const bbTopics = await prisma.topic.findMany({ where: { subjectId: bbSubject.id }, select: { id: true, path: true } });
  const bcsTopicIdByPath = new Map(bcsTopics.map((t) => [t.path, t.id]));
  const bbTopicIdByPath = new Map(bbTopics.map((t) => [t.path, t.id]));
  
  const text = readFileSync(FILE_PATH, "utf8");
  const parsed = parseVerbalFile(text);
  console.log(`Parsed ${parsed.records.length} records, skipped ${parsed.skipped.length}`);
  parsed.skipped.slice(0, 10).forEach(s => console.log(`  [skip] ${s}`));
  
  let totalInserted = 0;
  let totalUpdated = 0;
  
  // Import to BCS
  {
    const ops: any[] = [];
    for (const r of parsed.records) {
      const answerText = r.options[LETTERS.indexOf(r.answerLetter)];
      const gate = scanMca({
        question: r.question,
        options: r.options,
        correctAnswer: answerText,
        explanation: r.explanation,
      });
      if (gate.verdict === "REJECT") {
        console.log(`  [BCS reject] #${r.n}: ${gate.fatal.map((f: any) => f.code).join(",")}`);
        continue;
      }
      const norm = gate.normalized;
      const key = sourceKey(bcsSubject.id, "bcs-mental-verbal-file", r.n);
      ops.push({
        key,
        data: {
          ecosystemId: bcsEcosystem.id,
          subjectId: bcsSubject.id,
          topicId: bcsTopicIdByPath.get(BCS_VERBAL) ?? null,
          topic: BCS_VERBAL.split("/").pop() ?? "",
          subtopic: "",
          path: BCS_VERBAL,
          question: norm.question ?? r.question,
          options: norm.options ?? r.options,
          correctAnswer: norm.correctAnswer ?? answerText,
          explanation: norm.explanation ?? r.explanation,
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "BCS Mental · verbal-reasoning-file",
          questionNumber: r.n,
        },
      });
    }
    const ordered = [...ops].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    ordered.forEach((o, i) => {
      o.data.options = balanceOptions(o.data.options as any, o.data.correctAnswer as string, i % 4, o.key);
    });
    const existing = await prisma.question.findMany({
      where: { subjectId: bcsSubject.id, sourceKey: { in: ops.map((o) => o.key) } },
      select: { sourceKey: true },
    });
    const existingKeys = new Set(existing.map((e) => e.sourceKey));
    const fresh = ordered.filter((o) => !existingKeys.has(o.key));
    const stale = ordered.filter((o) => existingKeys.has(o.key));
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      await prisma.question.createMany({ data: chunk.map((o) => ({ ...o.data, sourceKey: o.key })) });
      totalInserted += chunk.length;
    }
    if (stale.length > 0) {
      await prisma.$transaction(stale.map((o) => prisma.question.update({ where: { subjectId_sourceKey: { subjectId: bcsSubject.id, sourceKey: o.key } }, data: { ...o.data, sourceKey: o.key } })));
      totalUpdated += stale.length;
    }
    console.log(`BCS: inserted ${totalInserted}, updated ${totalUpdated}`);
  }
  
  // Import to Bank
  {
    let inserted = 0, updated = 0;
    const ops: any[] = [];
    for (const r of parsed.records) {
      const answerText = r.options[LETTERS.indexOf(r.answerLetter)];
      const gate = scanMca({
        question: r.question,
        options: r.options,
        correctAnswer: answerText,
        explanation: r.explanation,
      });
      if (gate.verdict === "REJECT") continue;
      const norm = gate.normalized;
      const key = sourceKey(bbSubject.id, "bank-analytical-verbal-file", r.n);
      ops.push({
        key,
        data: {
          ecosystemId: bbEcosystem.id,
          subjectId: bbSubject.id,
          topicId: bbTopicIdByPath.get(BB_VERBAL) ?? null,
          topic: BB_VERBAL.split("/").pop() ?? "",
          subtopic: "Logical_Deduction_and_Syllogism",
          path: BB_VERBAL,
          question: norm.question ?? r.question,
          options: norm.options ?? r.options,
          correctAnswer: norm.correctAnswer ?? answerText,
          explanation: norm.explanation ?? r.explanation,
          difficulty: "MEDIUM",
          year: null,
          sourceExam: "Bank Analytical · verbal-reasoning",
          questionNumber: r.n,
        },
      });
    }
    const ordered = [...ops].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const existing = await prisma.question.findMany({
      where: { subjectId: bbSubject.id, sourceKey: { in: ops.map((o) => o.key) } },
      select: { sourceKey: true },
    });
    const existingKeys = new Set(existing.map((e) => e.sourceKey));
    const fresh = ordered.filter((o) => !existingKeys.has(o.key));
    const stale = ordered.filter((o) => existingKeys.has(o.key));
    for (let i = 0; i < fresh.length; i += 200) {
      const chunk = fresh.slice(i, i + 200);
      await prisma.question.createMany({ data: chunk.map((o) => ({ ...o.data, sourceKey: o.key })) });
      inserted += chunk.length;
    }
    if (stale.length > 0) {
      await prisma.$transaction(stale.map((o) => prisma.question.update({ where: { subjectId_sourceKey: { subjectId: bbSubject.id, sourceKey: o.key } }, data: { ...o.data, sourceKey: o.key } })));
      updated += stale.length;
    }
    console.log(`Bank: inserted ${inserted}, updated ${updated}`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await importVerbalToBoth(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-mental-verbal-both.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}

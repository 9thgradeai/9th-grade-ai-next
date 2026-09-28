/**
 * scripts/import-bank-math-indices.ts
 * ----------------------------------------------------------------------------
 * Imports the Bank Mathematics "Indices and Logarithms" MCQ docx
 * (database/data/Bank/Math/Indices and Logarithms — Bank Mathematics MCQ.docx)
 * into the BANGLADESH_BANK "03_Mathematics" subject ONLY. Never touches BCS.
 *
 * Pipeline:
 *   1. Converts the .docx to text with scripts/docx-math-to-text.py
 *      (OMML equations → Unicode: 2⁰⁺³, log₃81, √(…), (num)/(den)).
 *   2. Parses single-paragraph records:
 *        Question N. <stem>A. …B. …C. …D. …Answer: <L>Explanation: …
 *   3. Runs the shared import gate (scanMca). Rejects are counted + reported.
 *   4. Upserts by [subjectId, sourceKey] where sourceKey =
 *      md5(subjectId|bank-math|indices-logarithms|question).
 *
 * Target leaf: 03_Mathematics/Part_02_Algebra/Indices_and_Logarithms
 * Difficulty comes from the Section headers (Easy→EASY, Moderate→MEDIUM,
 * Difficult→HARD).
 *
 * Run:
 *   npx tsx scripts/import-bank-math-indices.ts            (apply)
 *   npx tsx scripts/import-bank-math-indices.ts --dry-run  (validate only)
 * ----------------------------------------------------------------------------
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca } from "./qb-forensics/import-gate";

const DOCX = join(
  process.cwd(),
  "database",
  "data",
  "Bank",
  "Math",
  "Indices and Logarithms — Bank Mathematics MCQ.docx",
);
const CONVERTER = join(process.cwd(), "scripts", "docx-math-to-text.py");
const BB_MATH_NAMEBN = "03_Mathematics";
const LEAF_PATH = "03_Mathematics/Part_02_Algebra/Indices_and_Logarithms";
const KEY_NS = "bank-math|indices-logarithms";

export type MathRecord = {
  n: number;
  question: string;
  options: [string, string, string, string];
  answerLetter: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

const Q_HEAD = /^Question\s+(\d+)\.\s*([\s\S]*)$/;
const REC_RE =
  /^([\s\S]*?)\s*A\.\s*([\s\S]*?)\s*B\.\s*([\s\S]*?)\s*C\.\s*([\s\S]*?)\s*D\.\s*([\s\S]*?)\s*Answer:\s*([A-D])\s*Explanation:\s*([\s\S]*)$/;

function difficultyFor(section: string): "EASY" | "MEDIUM" | "HARD" {
  const s = section.toLowerCase();
  if (s.includes("difficult")) return "HARD";
  if (s.includes("moderate")) return "MEDIUM";
  if (s.includes("easy")) return "EASY";
  return "MEDIUM";
}

/** Parse converted text (pure — unit-testable). */
export function parseMathText(text: string): { records: MathRecord[]; skipped: string[] } {
  const records: MathRecord[] = [];
  const skipped: string[] = [];
  let section = "";
  let last: MathRecord | null = null;
  for (const rawPara of text.split(/\n/)) {
    const line = rawPara.trim();
    if (!line) continue;
    if (/^Section\s+[IVXLC]+:/i.test(line)) {
      section = line;
      last = null;
      continue;
    }
    if (/^Indices and Logarithms/i.test(line) || /^Comprehensive Quantitative/i.test(line)) continue;
    const head = line.match(Q_HEAD);
    if (!head) {
      // Multi-paragraph explanation continuation (e.g. Q33/Q37 derivation
      // steps sit in their own docx paragraphs). Append to the previous
      // record instead of dropping the content.
      if (last) {
        last.explanation = `${last.explanation}\n${line}`.trim().normalize("NFC");
      } else {
        skipped.push(`non-question para: ${line.slice(0, 80)}`);
      }
      continue;
    }
    const n = Number(head[1]);
    const m = head[2].match(REC_RE);
    if (!m) {
      skipped.push(`Q${n}: unparseable options/answer block`);
      continue;
    }
    const [, stem, a, b, c, d, letter, expl] = m;
    const opts = [a, b, c, d].map((o) => o.trim().normalize("NFC"));
    if (opts.some((o) => !o)) {
      skipped.push(`Q${n}: empty option`);
      continue;
    }
    if (!["A", "B", "C", "D"].includes(letter)) {
      skipped.push(`Q${n}: bad answer letter ${letter}`);
      continue;
    }
    // Known source quirk: Q18's "7^f = 8" superscript-f renders as "7⁺".
    const fixSupF = (s: string) => s.replace(/7⁺\s*=\s*8/g, "7ᶠ = 8");
    const rec: MathRecord = {
      n,
      question: fixSupF(stem.trim().normalize("NFC")),
      options: opts as [string, string, string, string],
      answerLetter: letter as MathRecord["answerLetter"],
      explanation: expl.trim().normalize("NFC"),
      difficulty: difficultyFor(section),
    };
    records.push(rec);
    last = rec;
  }
  return { records, skipped };
}

export function convertDocx(): string {
  const out = join(tmpdir(), `bank-math-indices-${Date.now()}.txt`);
  execFileSync("python3", [CONVERTER, DOCX, out], { stdio: "pipe" });
  return readFileSync(out, "utf8");
}

export async function importBankMathIndices(
  prisma: PrismaClient,
  text?: string,
  dryRun = false,
) {
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing — run seed-bb-subjects.ts first");
  const subject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: BB_MATH_NAMEBN } },
  });
  if (!subject) throw new Error(`Bank Math subject "${BB_MATH_NAMEBN}" missing — run seed-bb-subjects.ts first`);
  const leaf = await prisma.topic.findUnique({
    where: { subjectId_path: { subjectId: subject.id, path: LEAF_PATH } },
  });
  if (!leaf) throw new Error(`Topic leaf "${LEAF_PATH}" missing — run seed-bb-subjects.ts first`);

  const raw = text ?? convertDocx();
  const { records, skipped } = parseMathText(raw);
  const report = {
    parsed: records.length,
    inserted: 0,
    updated: 0,
    rejected: 0,
    skippedParas: skipped.length,
    byDifficulty: {} as Record<string, number>,
  };
  for (const s of skipped) console.warn(`  [skip] ${s}`);

  const seen = new Set<string>();
  type Op = {
    key: string;
    n: number;
    data: {
      ecosystemId: number;
      subjectId: number;
      topicId: number;
      topic: string;
      subtopic: string;
      path: string;
      question: string;
      options: string[];
      correctAnswer: string;
      explanation: string;
      difficulty: "EASY" | "MEDIUM" | "HARD";
      sourceExam: string;
      questionNumber: number;
    };
  };
  const ops: Op[] = [];
  const rejects: Record<string, number> = {};
  for (const r of records) {
    const answerText = r.options[["A", "B", "C", "D"].indexOf(r.answerLetter)];
    const gate = scanMca({
      question: r.question,
      options: r.options,
      correctAnswer: answerText,
      explanation: r.explanation,
    });
    if (gate.verdict === "REJECT") {
      report.rejected++;
      for (const f of gate.fatal) rejects[`${f.code}@${f.field}`] = (rejects[`${f.code}@${f.field}`] ?? 0) + 1;
      console.warn(`  [reject] Q${r.n}: ${gate.fatal.map((f) => `${f.code}@${f.field}`).join(", ")}`);
      continue;
    }
    const norm = gate.normalized;
    const key = sourceKey(subject.id, KEY_NS, norm.question ?? r.question);
    if (seen.has(key)) {
      report.rejected++;
      rejects["DUPLICATE_IN_FILE"] = (rejects["DUPLICATE_IN_FILE"] ?? 0) + 1;
      console.warn(`  [reject] Q${r.n}: duplicate question text in-file`);
      continue;
    }
    seen.add(key);
    ops.push({
      key,
      n: r.n,
      data: {
        ecosystemId: bb.id,
        subjectId: subject.id,
        topicId: leaf.id,
        topic: "Indices_and_Logarithms",
        subtopic: "Indices and Logarithms",
        path: LEAF_PATH,
        question: norm.question ?? r.question,
        options: norm.options ?? r.options,
        correctAnswer: norm.correctAnswer ?? answerText,
        explanation: norm.explanation ?? r.explanation,
        difficulty: r.difficulty,
        sourceExam: "Bank Mathematics · Indices and Logarithms",
        questionNumber: r.n,
      },
    });
    report.byDifficulty[r.difficulty] = (report.byDifficulty[r.difficulty] ?? 0) + 1;
  }
  if (Object.keys(rejects).length > 0) console.log("  rejects:", rejects);

  if (dryRun) return report;
  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id, sourceKey: { in: ops.map((o) => o.key) } },
    select: { sourceKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.sourceKey));
  const fresh = ops.filter((o) => !existingKeys.has(o.key));
  const stale = ops.filter((o) => existingKeys.has(o.key));
  for (let i = 0; i < fresh.length; i += 200) {
    await prisma.question.createMany({ data: fresh.slice(i, i + 200).map((o) => ({ sourceKey: o.key, ...o.data })) });
    report.inserted += Math.min(200, fresh.length - i);
  }
  if (stale.length > 0) {
    await prisma.$transaction(
      stale.map((o) =>
        prisma.question.update({
          where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: o.key } },
          data: o.data,
        }),
      ),
    );
    report.updated += stale.length;
  }
  // Refresh the leaf's denormalised count (Practice tree reads questionCount).
  const count = await prisma.question.count({ where: { subjectId: subject.id, path: LEAF_PATH } });
  await prisma.topic.update({ where: { id: leaf.id }, data: { questionCount: String(count) } });
  return report;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!existsSync(DOCX)) {
    console.error(`DOCX missing: ${DOCX}`);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const { config } = await import("dotenv");
  config({ path: join(process.cwd(), ".env.local") });
  config({ path: join(process.cwd(), ".env") });
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  try {
    const report = await importBankMathIndices(prisma, undefined, dryRun);
    console.log(
      `\n✓ Done${dryRun ? " (dry-run)" : ""}. parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} rejected=${report.rejected} skippedParas=${report.skippedParas} byDifficulty=${JSON.stringify(report.byDifficulty)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

const invoked = process.argv[1]?.endsWith("import-bank-math-indices.ts");
if (invoked) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}

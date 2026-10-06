/**
 * scripts/import-bank-math-indices.ts
 * ----------------------------------------------------------------------------
 * Imports the Bank Mathematics "Indices and Logarithms" MCQ docx
 * (database/data/Bank/Math/Indices and Logarithms — Bank Mathematics MCQ.docx)
 * into the BANGLADESH_BANK "03_Mathematics" subject ONLY. Never touches BCS.
 *
 * Pipeline:
 *   1. Converts the .docx to text with scripts/docx-math-to-latex.py
 *      (OMML equations → LaTeX: $\frac{..}{..}$, $x^{..}$, $\sqrt[4]{..}$).
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
// Canonical math pipeline — single facade (converges with seed/AI/manual).
import { mathFingerprint } from "./qb-forensics/unicode-math-to-latex";
import { normalizeMcqFields } from "../backend/services/math";

const DOCX = join(
  process.cwd(),
  "database",
  "data",
  "Bank",
  "Math",
  "Indices and Logarithms — Bank Mathematics MCQ.docx",
);
const CONVERTER = join(process.cwd(), "scripts", "docx-math-to-latex.py");
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
    const opts = [a, b, c, d].map((o) => o.trim());
    if (opts.some((o) => !o)) {
      skipped.push(`Q${n}: empty option`);
      continue;
    }
    if (!["A", "B", "C", "D"].includes(letter)) {
      skipped.push(`Q${n}: bad answer letter ${letter}`);
      continue;
    }
    // Known source quirk: Q18's "7^f = 8" superscript-f renders as "7⁺".
    // Fix on the RAW stem first — after LaTeX migration the glyph is gone.
    // The OMML→LaTeX converter may already have produced "$7^{+}$ = 8";
    // cover that shape too.
    const fixSupF = (s: string) =>
      s
        .replace(/7⁺\s*=\s*8/g, "7ᶠ = 8")
        .replace(/\$7\^{\+}\$\s*=\s*8/g, "$7^{f}$ = 8");
    const rec: MathRecord = {
      n,
      question: fixSupF(stem.trim().normalize("NFC")),
      options: opts as [string, string, string, string],
      answerLetter: letter as MathRecord["answerLetter"],
      explanation: expl.trim(),
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
    adopted: 0,
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
    // Canonical math normalization (repair + preservation + validation) runs
    // here — the gate then REJECTs anything that still cannot render.
    const { record: canonRec } = normalizeMcqFields({
      question: r.question,
      options: r.options,
      correctAnswer: answerText,
      explanation: r.explanation,
    });
    const gate = scanMca(canonRec);
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

  if (dryRun) {
    // Report content-adoptions without writing: fresh records whose key is
    // new but whose fingerprint matches exactly one existing leaf row.
    const rows = await prisma.question.findMany({
      where: { subjectId: subject.id, path: LEAF_PATH },
      select: { sourceKey: true, question: true },
    });
    const haveKeys = new Set(rows.map((r) => r.sourceKey));
    const fpIndex = new Map<string, number>();
    let collisions = 0;
    for (const r of rows) {
      const fp = mathFingerprint(r.question);
      if (fpIndex.has(fp)) collisions++;
      else fpIndex.set(fp, 1);
    }
    for (const o of ops) {
      if (haveKeys.has(o.key)) continue;
      if (fpIndex.get(mathFingerprint(o.data.question)) === 1) report.adopted++;
    }
    if (collisions > 0) console.log(`  note: ${collisions} fingerprint collisions in leaf (adopt skipped for those)`);
    return report;
  }
  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id, sourceKey: { in: ops.map((o) => o.key) } },
    select: { sourceKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.sourceKey));
  const fresh = ops.filter((o) => !existingKeys.has(o.key));
  const stale = ops.filter((o) => existingKeys.has(o.key));
  // Content adoption: a fresh-keyed op that fingerprint-matches exactly one
  // existing leaf row (same question, older pipeline generation) UPDATES
  // that row instead of inserting a duplicate.
  const claimed = new Set<number>();
  const adopted: { op: (typeof ops)[number]; id: number }[] = [];
  const inserted: typeof ops = [];
  if (fresh.length > 0) {
    const leafRows = await prisma.question.findMany({
      where: { subjectId: subject.id, path: LEAF_PATH },
      select: { id: true, sourceKey: true, question: true },
    });
    const fpIndex = new Map<string, { id: number; sourceKey: string }[]>();
    for (const r of leafRows) {
      if (existingKeys.has(r.sourceKey)) continue; // already claimed by key
      const fp = mathFingerprint(r.question);
      fpIndex.set(fp, [...(fpIndex.get(fp) ?? []), r]);
    }
    for (const o of fresh) {
      const cands = (fpIndex.get(mathFingerprint(o.data.question)) ?? []).filter(
        (r) => !claimed.has(r.id),
      );
      if (cands.length === 1) {
        claimed.add(cands[0].id);
        adopted.push({ op: o, id: cands[0].id });
      } else {
        if (cands.length > 1) console.warn(`  [adopt-skip] Q${o.n}: ${cands.length} fingerprint matches`);
        inserted.push(o);
      }
    }
  }
  for (let i = 0; i < inserted.length; i += 200) {
    await prisma.question.createMany({ data: inserted.slice(i, i + 200).map((o) => ({ sourceKey: o.key, ...o.data })) });
    report.inserted += Math.min(200, inserted.length - i);
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
  if (adopted.length > 0) {
    await prisma.$transaction(
      adopted.map(({ op, id }) =>
        prisma.question.update({
          where: { id },
          data: { sourceKey: op.key, ...op.data },
        }),
      ),
    );
    report.adopted += adopted.length;
  }
  // Refresh the leaf's denormalised count (Practice tree reads questionCount).
  const count = await prisma.question.count({ where: { subjectId: subject.id, path: LEAF_PATH } });
  await prisma.topic.update({ where: { id: leaf.id }, data: { questionCount: count } });
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
      `\n✓ Done${dryRun ? " (dry-run)" : ""}. parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} adopted=${report.adopted} rejected=${report.rejected} skippedParas=${report.skippedParas} byDifficulty=${JSON.stringify(report.byDifficulty)}`,
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

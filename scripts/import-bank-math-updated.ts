/**
 * scripts/import-bank-math-updated.ts
 * ---------------------------------------------------------------------------
 * Import all 7 updated Bank Math DOCX files into the BANGLADESH_BANK
 * "03_Mathematics" subject. Every equation goes through the OMML→LaTeX
 * converter (docx-math-to-latex.py) so KaTeX renders them book-exact.
 *
 * Topic mapping (docx file → taxonomy leaf path):
 *   Questions(Percentages)                → 03_Mathematics/Part_01_Arithmetic/Percentages
 *   Questions(LCM_HCF)                    → 03_Mathematics/Part_01_Arithmetic/LCM_and_HCF
 *   Questions(Simple and Compound ...)    → 03_Mathematics/Part_01_Arithmetic/Simple_and_Compound_Interest
 *   Questions(Profit_Loss_and_Discount)   → 03_Mathematics/Part_01_Arithmetic/Profit_Loss_and_Discount
 *   Questions(Ratios, Proportions, ...)   → 03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures
 *   Questions(ArithmeticProgression)      → 03_Mathematics/Part_03_Sequences_and_Series/Arithmetic_Progression
 *   Questions(Geometric Progression)      → 03_Mathematics/Part_03_Sequences_and_Series/Geometric_Progression
 *
 * Pipeline per record:
 *   1. docx-math-to-latex.py: OMML → $\LaTeX$ (book-exact fractions/roots/scripts)
 *   2. normalizeMcqFields: canonical math normalization (repair + validate)
 *   3. scanMca import gate: reject corrupt / empty / structural failures
 *   4. upsert by sourceKey = md5(subjectId|namespace|question)
 *
 * Run:
 *   npx tsx scripts/import-bank-math-updated.ts            (apply all)
 *   npx tsx scripts/import-bank-math-updated.ts --dry-run  (validate only)
 *   npx tsx scripts/import-bank-math-updated.ts --topic Percentages (single topic)
 * ---------------------------------------------------------------------------
 */
import { execFileSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PrismaClient } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { scanMca } from "./qb-forensics/import-gate";
import { mathFingerprint } from "./qb-forensics/unicode-math-to-latex";
import { normalizeMcqFields } from "../backend/services/math";

const DATA_DIR = join(process.cwd(), "database", "data", "Bank", "Math", "updated");
const CONVERTER = join(process.cwd(), "scripts", "docx-math-to-latex.py");
const BB_MATH_NAMEBN = "03_Mathematics";

// ── Topic config ─────────────────────────────────────────────────────────────

type TopicConfig = {
  /** Short name for CLI --topic filter and log output */
  name: string;
  /** .docx filename (relative to DATA_DIR) */
  docx: string;
  /** Taxonomy leaf path (must match Topic.path in DB) */
  leafPath: string;
  /** topic field stored on Question row */
  topic: string;
  /** subtopic field stored on Question row */
  subtopic: string;
  /** Namespace for sourceKey computation (must be unique per topic) */
  keyNs: string;
  /** sourceExam label */
  sourceExam: string;
  /** Default difficulty when no Section header is found in the file */
  defaultDifficulty: "EASY" | "MEDIUM" | "HARD";
};

const TOPIC_CONFIGS: TopicConfig[] = [
  {
    name: "Percentages",
    docx: "Questions(Percentages).docx",
    leafPath: "03_Mathematics/Part_01_Arithmetic/Percentages",
    topic: "Percentages",
    subtopic: "Percentages",
    keyNs: "bank-math|percentages",
    sourceExam: "Bank Mathematics · Percentages",
    defaultDifficulty: "MEDIUM",
  },
  {
    name: "LCM_HCF",
    docx: "Questions(LCM_HCF).docx",
    leafPath: "03_Mathematics/Part_01_Arithmetic/LCM_and_HCF",
    topic: "LCM_and_HCF",
    subtopic: "LCM and HCF",
    keyNs: "bank-math|lcm-hcf",
    sourceExam: "Bank Mathematics · LCM and HCF",
    defaultDifficulty: "MEDIUM",
  },
  {
    name: "SimpleAndCompoundInterest",
    docx: "Questions(Simple and Compound Interest).docx",
    leafPath: "03_Mathematics/Part_01_Arithmetic/Simple_and_Compound_Interest",
    topic: "Simple_and_Compound_Interest",
    subtopic: "Simple and Compound Interest",
    keyNs: "bank-math|simple-compound-interest",
    sourceExam: "Bank Mathematics · Simple and Compound Interest",
    defaultDifficulty: "MEDIUM",
  },
  {
    name: "ProfitLossDiscount",
    docx: "Questions(Profit_Loss_and_Discount).docx",
    leafPath: "03_Mathematics/Part_01_Arithmetic/Profit_Loss_and_Discount",
    topic: "Profit_Loss_and_Discount",
    subtopic: "Profit, Loss and Discount",
    keyNs: "bank-math|profit-loss-discount",
    sourceExam: "Bank Mathematics · Profit, Loss and Discount",
    defaultDifficulty: "MEDIUM",
  },
  {
    name: "RatiosProportionsMixtures",
    docx: "Questions(Ratios, Proportions, and Mixtures).docx",
    leafPath: "03_Mathematics/Part_01_Arithmetic/Ratios_Proportions_and_Mixtures",
    topic: "Ratios_Proportions_and_Mixtures",
    subtopic: "Ratios, Proportions and Mixtures",
    keyNs: "bank-math|ratios-proportions-mixtures",
    sourceExam: "Bank Mathematics · Ratios, Proportions and Mixtures",
    defaultDifficulty: "MEDIUM",
  },
  {
    name: "ArithmeticProgression",
    docx: "Questions(ArithmeticProgression).docx",
    leafPath: "03_Mathematics/Part_03_Sequences_and_Series/Arithmetic_Progression",
    topic: "Arithmetic_Progression",
    subtopic: "Arithmetic Progression",
    keyNs: "bank-math|arithmetic-progression",
    sourceExam: "Bank Mathematics · Arithmetic Progression",
    defaultDifficulty: "MEDIUM",
  },
  {
    name: "GeometricProgression",
    docx: "Questions(Geometric Progression).docx",
    leafPath: "03_Mathematics/Part_03_Sequences_and_Series/Geometric_Progression",
    topic: "Geometric_Progression",
    subtopic: "Geometric Progression",
    keyNs: "bank-math|geometric-progression",
    sourceExam: "Bank Mathematics · Geometric Progression",
    defaultDifficulty: "MEDIUM",
  },
];

// ── Parsing ───────────────────────────────────────────────────────────────────

type ParsedRecord = {
  n: number;
  question: string;
  options: [string, string, string, string];
  answerLetter: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
};

/** Bangla digit → ASCII digit */
function normalizeBanglaDigits(s: string): string {
  return s.replace(/[০১২৩৪৫৬৭৮৯]/g, (c) => String("০১২৩৪৫৬৭৮৯".indexOf(c)));
}

/** Normalize a question number prefix (arabic or bangla) */
function parseQuestionHead(line: string): { n: number; rest: string } | null {
  // "Question N." prefix (Indices-style)
  let m = line.match(/^Question\s+(\d+)\.\s*([\s\S]*)$/);
  if (m) return { n: Number(m[1]), rest: m[2] };
  // "N." or "N)" arabic prefix
  m = line.match(/^(\d{1,3})[.)]\s+([\s\S]+)$/);
  if (m) return { n: Number(m[1]), rest: m[2] };
  // "১." bangla digit prefix
  const norm = normalizeBanglaDigits(line);
  m = norm.match(/^(\d{1,3})[.)]\s+([\s\S]+)$/);
  if (m && m[1].length <= 3) return { n: Number(m[1]), rest: m[2] };
  return null;
}

function difficultyFor(section: string): "EASY" | "MEDIUM" | "HARD" {
  const s = section.toLowerCase();
  if (s.includes("difficult") || s.includes("hard")) return "HARD";
  if (s.includes("moderate") || s.includes("medium")) return "MEDIUM";
  if (s.includes("easy")) return "EASY";
  return "MEDIUM";
}

/**
 * Parse the MCQ body from a partially consumed paragraph string.
 * Handles both:
 *   – Multi-line (each field on its own line, standard format)
 *   – Single-line (everything concatenated: "stem A. … B. … Answer: X Explanation: …")
 */
// Handles two Answer: formats:
//   "Answer: B Explanation:"        (plain letter)
//   "Answer: B. 96 Explanation:"     (letter + option text, used in GP/LCM files)
//   "Answer: B.\n"                   (letter, next para = Explanation)
const REC_RE =
  /^([\s\S]*?)\s*A\.\s*([\s\S]*?)\s*B\.\s*([\s\S]*?)\s*C\.\s*([\s\S]*?)\s*D\.\s*([\s\S]*?)\s*Answer:\s*([A-D])(?:\.[^A-Z\n][^\n]*?)?\s*Explanation:\s*([\s\S]*)$/;

function parseBody(
  body: string,
): { stem: string; opts: string[]; letter: string; expl: string } | null {
  const m = body.match(REC_RE);
  if (!m) return null;
  const [, stem, a, b, c, d, letter, expl] = m;
  return {
    stem: stem.trim(),
    opts: [a.trim(), b.trim(), c.trim(), d.trim()],
    letter,
    expl: expl.trim(),
  };
}

export function parseMathFile(
  text: string,
  defaultDifficulty: "EASY" | "MEDIUM" | "HARD",
): { records: ParsedRecord[]; skipped: string[] } {
  const records: ParsedRecord[] = [];
  const skipped: string[] = [];
  let section = "";
  let pendingN: number | null = null;
  let pendingBody = "";

  const flush = () => {
    if (pendingN === null || !pendingBody.trim()) return;
    const parsed = parseBody(pendingBody);
    if (!parsed) {
      skipped.push(`Q${pendingN}: unparseable body — ${pendingBody.slice(0, 80)}`);
      pendingN = null;
      pendingBody = "";
      return;
    }
    const { stem, opts, letter, expl } = parsed;
    if (!["A", "B", "C", "D"].includes(letter)) {
      skipped.push(`Q${pendingN}: bad answer letter "${letter}"`);
    } else if (opts.some((o) => !o.trim())) {
      skipped.push(`Q${pendingN}: empty option`);
    } else {
      records.push({
        n: pendingN,
        question: stem.normalize("NFC"),
        options: opts.map((o) => o.normalize("NFC")) as [
          string,
          string,
          string,
          string,
        ],
        answerLetter: letter as "A" | "B" | "C" | "D",
        explanation: expl.normalize("NFC"),
        difficulty: section ? difficultyFor(section) : defaultDifficulty,
      });
    }
    pendingN = null;
    pendingBody = "";
  };

  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    // Section headers (difficulty markers)
    if (/^Section\s+[IVXLC]+:/i.test(line) || /^(Easy|Moderate|Difficult|Hard)\s*:/i.test(line)) {
      flush();
      section = line;
      continue;
    }
    // Skip document-level headers
    if (
      /^(Bank\s+Math|Mathematics|Quantitative|Comprehensive|MCQ)/i.test(line) &&
      line.length < 80
    ) {
      continue;
    }

    const head = parseQuestionHead(line);
    if (head) {
      flush();
      pendingN = head.n;
      pendingBody = head.rest;
      continue;
    }

    // Continuation line (options, answer, explanation, multi-para explanation)
    if (pendingN !== null) {
      pendingBody += " " + line;
    } else {
      skipped.push(`non-question para: ${line.slice(0, 80)}`);
    }
  }
  flush(); // last record

  return { records, skipped };
}

// ── DOCX conversion ───────────────────────────────────────────────────────────

function convertDocx(docxPath: string): string {
  const out = join(tmpdir(), `bank-math-${Date.now()}.txt`);
  execFileSync("python3", [CONVERTER, docxPath, out], { stdio: "pipe" });
  return readFileSync(out, "utf8");
}

// ── DB upsert ─────────────────────────────────────────────────────────────────

type TopicRow = { id: number; path: string };

async function importOneTopic(
  prisma: PrismaClient,
  config: TopicConfig,
  subjectId: number,
  ecosystemId: number,
  leaf: TopicRow,
  dryRun: boolean,
): Promise<{
  parsed: number;
  inserted: number;
  updated: number;
  adopted: number;
  rejected: number;
  skippedParas: number;
}> {
  const docxPath = join(DATA_DIR, config.docx);
  if (!existsSync(docxPath)) throw new Error(`DOCX not found: ${docxPath}`);

  const raw = convertDocx(docxPath);
  const { records, skipped } = parseMathFile(raw, config.defaultDifficulty);
  for (const s of skipped) console.warn(`    [skip] ${s}`);

  const report = {
    parsed: records.length,
    inserted: 0,
    updated: 0,
    adopted: 0,
    rejected: 0,
    skippedParas: skipped.length,
  };

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
  const seen = new Set<string>();
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
      for (const f of gate.fatal) {
        rejects[`${f.code}@${f.field}`] = (rejects[`${f.code}@${f.field}`] ?? 0) + 1;
      }
      console.warn(`    [reject] Q${r.n}: ${gate.fatal.map((f) => `${f.code}@${f.field}`).join(", ")}`);
      continue;
    }
    const norm = gate.normalized;
    const key = sourceKey(subjectId, config.keyNs, norm.question ?? r.question);
    if (seen.has(key)) {
      report.rejected++;
      rejects["DUPLICATE_IN_FILE"] = (rejects["DUPLICATE_IN_FILE"] ?? 0) + 1;
      console.warn(`    [reject] Q${r.n}: duplicate question text in-file`);
      continue;
    }
    seen.add(key);
    ops.push({
      key,
      n: r.n,
      data: {
        ecosystemId,
        subjectId,
        topicId: leaf.id,
        topic: config.topic,
        subtopic: config.subtopic,
        path: config.leafPath,
        question: norm.question ?? r.question,
        options: norm.options ?? r.options,
        correctAnswer: norm.correctAnswer ?? answerText,
        explanation: norm.explanation ?? r.explanation,
        difficulty: r.difficulty,
        sourceExam: config.sourceExam,
        questionNumber: r.n,
      },
    });
  }
  if (Object.keys(rejects).length > 0) console.log(`    rejects:`, rejects);

  if (dryRun) {
    console.log(`    [dry-run] would upsert ${ops.length} records → ${config.leafPath}`);
    return report;
  }

  // ── Upsert: key match → update; new key → check fingerprint (adopt) or insert ──
  const existing = await prisma.question.findMany({
    where: { subjectId, sourceKey: { in: ops.map((o) => o.key) } },
    select: { sourceKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.sourceKey));
  const fresh = ops.filter((o) => !existingKeys.has(o.key));
  const stale = ops.filter((o) => existingKeys.has(o.key));

  // Content adoption: fresh-key but fingerprint matches an existing leaf row → update in-place
  const claimed = new Set<number>();
  const adopted: { op: (typeof ops)[number]; id: number }[] = [];
  const inserted: typeof ops = [];

  if (fresh.length > 0) {
    const leafRows = await prisma.question.findMany({
      where: { subjectId, path: config.leafPath },
      select: { id: true, sourceKey: true, question: true },
    });
    const fpIndex = new Map<string, { id: number; sourceKey: string }[]>();
    for (const row of leafRows) {
      if (existingKeys.has(row.sourceKey)) continue;
      const fp = mathFingerprint(row.question);
      fpIndex.set(fp, [...(fpIndex.get(fp) ?? []), row]);
    }
    for (const o of fresh) {
      const cands = (fpIndex.get(mathFingerprint(o.data.question)) ?? []).filter(
        (r) => !claimed.has(r.id),
      );
      if (cands.length === 1) {
        claimed.add(cands[0].id);
        adopted.push({ op: o, id: cands[0].id });
      } else {
        if (cands.length > 1) console.warn(`    [adopt-skip] Q${o.n}: ${cands.length} fingerprint matches`);
        inserted.push(o);
      }
    }
  }

  // Batch insert
  for (let i = 0; i < inserted.length; i += 200) {
    await prisma.question.createMany({
      data: inserted.slice(i, i + 200).map((o) => ({ sourceKey: o.key, ...o.data })),
    });
    report.inserted += Math.min(200, inserted.length - i);
  }
  // Update stale keys
  if (stale.length > 0) {
    await prisma.$transaction(
      stale.map((o) =>
        prisma.question.update({
          where: { subjectId_sourceKey: { subjectId, sourceKey: o.key } },
          data: o.data,
        }),
      ),
    );
    report.updated += stale.length;
  }
  // Adopt fingerprint-matched rows
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

  // Refresh questionCount denorm on the leaf topic node
  const count = await prisma.question.count({ where: { subjectId, path: config.leafPath } });
  await prisma.topic.update({ where: { id: leaf.id }, data: { questionCount: String(count) } });

  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const topicArg = process.argv.find((a) => a.startsWith("--topic="))?.split("=")[1];

  const { config } = await import("dotenv");
  config({ path: join(process.cwd(), ".env.local") });
  config({ path: join(process.cwd(), ".env") });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) { console.error("DATABASE_URL is required"); process.exit(1); }

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  try {
    const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
    if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing — run: npx tsx scripts/seed-bb-subjects.ts");

    const subject = await prisma.subject.findUnique({
      where: { ecosystemId_nameBn: { ecosystemId: bb.id, nameBn: BB_MATH_NAMEBN } },
    });
    if (!subject) throw new Error(`Bank Math subject "${BB_MATH_NAMEBN}" missing — run seeds first`);

    // Filter to requested topic(s)
    const configs = topicArg
      ? TOPIC_CONFIGS.filter((c) => c.name.toLowerCase().includes(topicArg.toLowerCase()))
      : TOPIC_CONFIGS;

    if (configs.length === 0) {
      console.error(`No topic matched "${topicArg}". Valid names: ${TOPIC_CONFIGS.map((c) => c.name).join(", ")}`);
      process.exit(1);
    }

    const grandTotal = { parsed: 0, inserted: 0, updated: 0, adopted: 0, rejected: 0, skippedParas: 0 };

    for (const cfg of configs) {
      console.log(`\n── ${cfg.name} ─────────────────────────────`);
      console.log(`   docx:     ${cfg.docx}`);
      console.log(`   leaf:     ${cfg.leafPath}`);

      const leaf = await prisma.topic.findUnique({
        where: { subjectId_path: { subjectId: subject.id, path: cfg.leafPath } },
      });
      if (!leaf) {
        console.error(`   ❌ Topic leaf not found: ${cfg.leafPath}`);
        console.error(`      Run: npx tsx scripts/seed-bb-subjects.ts`);
        continue;
      }

      const r = await importOneTopic(prisma, cfg, subject.id, bb.id, leaf, dryRun);
      console.log(
        `   ✓ parsed=${r.parsed} inserted=${r.inserted} updated=${r.updated} adopted=${r.adopted} rejected=${r.rejected} skippedParas=${r.skippedParas}`,
      );
      grandTotal.parsed += r.parsed;
      grandTotal.inserted += r.inserted;
      grandTotal.updated += r.updated;
      grandTotal.adopted += r.adopted;
      grandTotal.rejected += r.rejected;
      grandTotal.skippedParas += r.skippedParas;
    }

    console.log(`\n${"─".repeat(55)}`);
    console.log(`GRAND TOTAL${dryRun ? " (dry-run)" : ""}:`);
    console.log(`  parsed:      ${grandTotal.parsed}`);
    console.log(`  inserted:    ${grandTotal.inserted}`);
    console.log(`  updated:     ${grandTotal.updated}`);
    console.log(`  adopted:     ${grandTotal.adopted}`);
    console.log(`  rejected:    ${grandTotal.rejected}`);
    console.log(`  skippedParas:${grandTotal.skippedParas}`);
    console.log(`${"─".repeat(55)}`);
    if (!dryRun) console.log("\n✓ Import complete. Equations typeset via KaTeX (book-exact).");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });

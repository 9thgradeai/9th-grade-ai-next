/**
 * scripts/import-bank-english.ts
 * ----------------------------------------------------------------------------
 * Subject-wise import pipeline for the Bangladesh Bank English corpus
 * (converted from the 5 topic .docx files via
 * scripts/docx-bank-english-to-md.py — bold/italic survive as ** / * markers
 * and are rendered by the frontend RichText component).
 *
 *   1. Parses database/data/Bank/English/md/<Topic>.md blocks:
 *        Q: <stem> / A) .. B) .. C) .. D) [.. E) ..] / Ans: <letter> / Exp: <text>
 *      Question numbers were stripped at conversion — the app renders its own
 *      counters. Answer letters are kept AS-IS (no position rebalancing).
 *
 *   2. Runs the shared import gate (scripts/qb-forensics/import-gate.ts).
 *      Rejected records are counted and REPORTED — never fabricated.
 *
 *   3. Upserts questions keyed by sourceKey =
 *      md5(subjectId|bank-english:<slug>|question) — a distinct key space, so
 *      re-runs are idempotent and never collide with exam-wise rows.
 *
 * Target: BANGLADESH_BANK ecosystem, subject 02_English_Language_and_Literature.
 *
 * Run:
 *   npx tsx scripts/import-bank-english.ts            (apply)
 *   npx tsx scripts/import-bank-english.ts --dry-run  (validate + report only)
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";
import { QueryCache } from "../backend/infrastructure/cache/query-cache";

const MD_DIR = join(process.cwd(), "database", "data", "Bank", "English", "md");

const LETTERS = ["A", "B", "C", "D", "E"];

// File topic → taxonomy leaf (must be an existing Topic row — the Practice
// selection tree only counts questions whose path attaches to the taxonomy).
// Voice & Narration splits per question by stem cue (see routeVoiceNarration).
const TOPIC_ROUTE: Record<string, { path: string; topic: string; subtopic: string }> = {
  "clauses-and-phrases": {
    path: "02_English_Language_and_Literature/PART-I_Language/Idioms_and_Phrases/Identifying_Phrases",
    topic: "Identifying_Phrases",
    subtopic: "Clauses & Phrases",
  },
  "errors-detection": {
    path: "02_English_Language_and_Literature/PART-I_Language/Corrections_and_Agreement",
    topic: "Corrections_and_Agreement",
    subtopic: "Errors Detection",
  },
  "idioms-and-phrases": {
    path: "02_English_Language_and_Literature/PART-I_Language/Idioms_and_Phrases/Meanings_of_Idioms",
    topic: "Meanings_of_Idioms",
    subtopic: "Idioms & Phrases",
  },
  "synonym-antonym": {
    path: "02_English_Language_and_Literature/PART-I_Language/Words_Vocabulary/Synonyms_and_Antonyms",
    topic: "Synonyms_and_Antonyms",
    subtopic: "Synonym-Antonym",
  },
  "voice-and-narration": {
    path: "02_English_Language_and_Literature/PART-I_Language/Sentences_and_Transformations/Active_and_Passive_Voice",
    topic: "Active_and_Passive_Voice",
    subtopic: "Voice & Narration",
  },
};

const VOICE_NARRATION_PATH =
  "02_English_Language_and_Literature/PART-I_Language/Sentences_and_Transformations/Direct_and_Indirect_Narration";

/** Narration cue in the stem (narration questions never say "change the voice"). */
export function routeVoiceNarration(question: string): { path: string; topic: string } {
  const q = question.toLowerCase();
  const isNarration =
    (q.includes("narrat") || q.includes("indirect speech") || q.includes("direct speech") || q.includes("reported speech")) &&
    !q.includes("change the voice");
  if (isNarration) return { path: VOICE_NARRATION_PATH, topic: "Direct_and_Indirect_Narration" };
  const base = TOPIC_ROUTE["voice-and-narration"];
  return { path: base.path, topic: base.topic };
}

type BankEnglishRecord = {
  topic: string;
  slug: string;
  n: number;
  question: string;
  options: string[];
  answerLetter: string;
  explanation: string;
};

function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function parseMdFile(file: string, content: string): { records: BankEnglishRecord[]; skipped: string[] } {
  const topic = file.replace(/\.md$/, "");
  const slug = slugify(topic);
  const records: BankEnglishRecord[] = [];
  const skipped: string[] = [];
  const blocks = content.split(/\n\s*\n/);
  let n = 0;
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0 || lines[0].startsWith("#")) continue;
    if (!lines[0].startsWith("Q:")) {
      skipped.push(`non-Q block: ${lines[0].slice(0, 80)}`);
      continue;
    }
    n += 1;
    const question = lines[0].replace(/^Q:\s*/, "");
    const options: string[] = [];
    let answerLetter = "";
    let explanation = "";
    for (const line of lines.slice(1)) {
      const optM = line.match(/^([A-E])\)\s*(.*)$/);
      if (optM) {
        options.push(optM[2]);
        continue;
      }
      const ansM = line.match(/^Ans:\s*([A-E])\s*$/);
      if (ansM) {
        answerLetter = ansM[1];
        continue;
      }
      const expM = line.match(/^Exp:\s*([\s\S]*)$/);
      if (expM) {
        explanation = expM[1] === "—" ? "" : expM[1];
        continue;
      }
      skipped.push(`unparsed line in Q#${n} (${topic}): ${line.slice(0, 80)}`);
    }
    records.push({ topic, slug, n, question, options, answerLetter, explanation });
  }
  return { records, skipped };
}

export async function importBankEnglish(prisma: PrismaClient, opts?: { dryRun?: boolean }) {
  const report = { files: 0, parsed: 0, inserted: 0, updated: 0, skipped: 0, rejected: 0, topics: {} as Record<string, number> };
  const dryRun = opts?.dryRun ?? process.argv.includes("--dry-run");

  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bb) throw new Error("BANGLADESH_BANK ecosystem missing");
  const subject = await prisma.subject.findFirst({
    where: { ecosystemId: bb.id, nameBn: "02_English_Language_and_Literature" },
  });
  if (!subject) throw new Error("Bank English subject missing");

  const topicRows = await prisma.topic.findMany({ where: { subjectId: subject.id } });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  const files = readdirSync(MD_DIR).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No .md files in ${MD_DIR} — run docx-bank-english-to-md.py first`);

  // Global duplicate identity: same normalized MCQ may exist only once.
  const globalSigs = new Set<string>();
  const existingForDedup = await prisma.question.findMany({
    select: { question: true, correctAnswer: true, explanation: true },
  });
  for (const r of existingForDedup) {
    globalSigs.add(mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }));
  }

  type Op = { key: string; data: Prisma.QuestionUncheckedCreateInput };
  const ops: Op[] = [];

  for (const file of files) {
    const { records, skipped } = parseMdFile(file, readFileSync(join(MD_DIR, file), "utf8"));
    report.files += 1;
    report.parsed += records.length;
    report.skipped += skipped.length;
    for (const s of skipped) console.warn(`  [skip] ${file}: ${s}`);
    const seenText = new Set<string>();
    for (const r of records) {
      if (r.question.length < 3) {
        report.skipped += 1;
        continue;
      }
      if (r.options.length < 4) {
        report.skipped += 1;
        console.warn(`  [skip] ${file} Q#${r.n}: only ${r.options.length} option(s)`);
        continue;
      }
      const answerIdx = LETTERS.indexOf(r.answerLetter);
      if (answerIdx < 0 || !r.options[answerIdx]) {
        report.skipped += 1;
        console.warn(`  [skip] ${file} Q#${r.n}: bad answer letter '${r.answerLetter}'`);
        continue;
      }
      const textKey = r.question.trim().toLowerCase() + "\n" + r.options.join("\n");
      if (seenText.has(textKey)) {
        report.skipped += 1;
        console.warn(`  [skip] ${file} Q#${r.n}: in-file duplicate`);
        continue;
      }
      seenText.add(textKey);

      const gate = scanMca({
        question: r.question,
        options: r.options,
        correctAnswer: r.options[answerIdx],
        explanation: r.explanation,
      });
      if (gate.verdict === "REJECT") {
        report.rejected += 1;
        console.warn(`  [reject] ${file} Q#${r.n}: ${gate.fatal.map((f) => f.code).join(",")}`);
        continue;
      }
      const sig = mcaSignature({
        question: r.question,
        options: r.options,
        correctAnswer: r.options[answerIdx],
        explanation: r.explanation,
      });
      if (globalSigs.has(sig)) {
        report.skipped += 1;
        console.warn(`  [skip] ${file} Q#${r.n}: already in database`);
        continue;
      }
      globalSigs.add(sig);

      const route = TOPIC_ROUTE[r.slug];
      if (!route) {
        report.skipped += 1;
        console.warn(`  [skip] ${file} Q#${r.n}: no taxonomy route for slug '${r.slug}'`);
        continue;
      }
      const topicIdRow = topicIdByPath.get(
        r.slug === "voice-and-narration" ? routeVoiceNarration(r.question).path : route.path,
      );
      const routed =
        r.slug === "voice-and-narration" ? routeVoiceNarration(r.question) : { path: route.path, topic: route.topic };
      const key = sourceKey(subject.id, `bank-english:${r.slug}`, r.question, r.options.join(" | "));
      ops.push({
        key,
        data: {
          ecosystemId: bb.id,
          subjectId: subject.id,
          topicId: topicIdRow ?? null,
          topic: routed.topic,
          subtopic: route.subtopic,
          path: routed.path,
          question: r.question,
          options: r.options,
          correctAnswer: r.options[answerIdx],
          explanation: r.explanation,
          difficulty: "MEDIUM",
          year: null,
          sourceExam: `Bank English · ${r.slug}`,
          questionNumber: r.n,
        },
      });
    }
    console.log(`  ✓ ${file}: ${records.length} parsed`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] ready to import: ${ops.length} (no writes)`);
    return report;
  }

  const existing = await prisma.question.findMany({
    where: { subjectId: subject.id, sourceKey: { in: ops.map((o) => o.key) } },
    select: { sourceKey: true },
  });
  const existingKeys = new Set(existing.map((e) => e.sourceKey));
  const fresh = ops.filter((o) => !existingKeys.has(o.key));
  const stale = ops.filter((o) => existingKeys.has(o.key));
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    await prisma.question.createMany({
      data: chunk.map((o) => ({ sourceKey: o.key, ...o.data })),
    });
    report.inserted += chunk.length;
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
  for (const o of ops) report.topics[o.data.topic as string] = (report.topics[o.data.topic as string] ?? 0) + 1;
  // Practice selection tree caches counts — bust it so the new pool shows up.
  if (!dryRun && (report.inserted > 0 || report.updated > 0)) {
    await QueryCache.invalidateExamTree().catch(() => {});
  }
  return report;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const report = await importBankEnglish(prisma);
    console.log(`\n✓ Done. files=${report.files} parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped} rejected=${report.rejected}`);
    for (const [t, c] of Object.entries(report.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-english.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

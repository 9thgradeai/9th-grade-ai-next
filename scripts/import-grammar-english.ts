/**
 * scripts/import-grammar-english.ts
 * ----------------------------------------------------------------------------
 * Imports the English Grammar corpus (converted from the 4 topic .docx files
 * via scripts/docx-grammar-to-md.py — bold/italic/underline survive as
 * ** / * markers and are rendered by the frontend RichText component).
 *
 *   1. Parses database/data/ques/English/Grammar/md/<Topic>.md blocks:
 *        Q: <stem> / A) .. B) .. C) .. D) / Ans: <letter> / Exp: <text>
 *      Question numbers were stripped at conversion — the app renders its own
 *      counters. Answer letters are kept AS-IS (no position rebalancing).
 *      Styling markers (**bold**, *italic*) are kept AS-IS.
 *
 *   2. Runs the shared import gate (scripts/qb-forensics/import-gate.ts).
 *      Rejected records are counted and REPORTED — never fabricated.
 *      Source rows with no parseable answer (e.g. the flagged Adverb item
 *      whose key says "[Note: The document indicates question error]") are
 *      skipped, never guessed.
 *
 *   3. Upserts questions keyed by sourceKey =
 *      md5(subjectId|grammar-english:<slug>|question) — a distinct key space,
 *      so re-runs are idempotent and never collide with exam-wise rows.
 *
 * Targets (same content in both ecosystems):
 *   BCS            (id 1) subject "English Language and Literature" (id 602)
 *   BANGLADESH_BANK(id 2) subject "02_English_Language_and_Literature" (id 4959)
 *
 * Run:
 *   npx tsx scripts/import-grammar-english.ts            (apply)
 *   npx tsx scripts/import-grammar-english.ts --dry-run  (validate + report only)
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

// query-cache.ts pulls in `server-only`, which throws under plain tsx
// (same latent issue exists in import-bank-english.ts). Invalidate lazily
// so the import works with or without the server boundary.
async function invalidateExamTreeSafe(): Promise<void> {
  try {
    const { QueryCache } = await import("../backend/infrastructure/cache/query-cache");
    await QueryCache.invalidateExamTree().catch(() => {});
  } catch {
    /* non-fatal: cache expires by TTL */
  }
}

const MD_DIR = join(process.cwd(), "database", "data", "ques", "English", "Grammar", "md");

const LETTERS = ["A", "B", "C", "D"];

function slugify(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Route = { bcs: { path: string; topic: string; subtopic: string }; bank: { path: string; topic: string; subtopic: string } };

const TOPIC_ROUTE: Record<string, Route> = {
  "verb-and-causative-verb": {
    bcs: {
      path: "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech/Verb",
      topic: "Verb",
      subtopic: "Verb & Causative Verb",
    },
    bank: {
      path: "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech/Verb_Transitive_Intransitive_Non-finite_Gerund_Participle",
      topic: "Verb_Transitive_Intransitive_Non-finite_Gerund_Participle",
      subtopic: "Verb & Causative Verb",
    },
  },
  adverb: {
    bcs: {
      path: "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech/Adverb",
      topic: "Adverb",
      subtopic: "Adverb",
    },
    bank: {
      path: "02_English_Language_and_Literature/PART-I_Language/Parts_of_Speech/Adjective_and_Adverb",
      topic: "Adjective_and_Adverb",
      subtopic: "Adverb",
    },
  },
  synonym: {
    bcs: {
      path: "02_English_Language_and_Literature/PART-I_Language/Words/Synonyms",
      topic: "Synonyms",
      subtopic: "Synonym",
    },
    bank: {
      path: "02_English_Language_and_Literature/PART-I_Language/Words_Vocabulary/Synonyms_and_Antonyms",
      topic: "Synonyms_and_Antonyms",
      subtopic: "Synonym",
    },
  },
  antonyms: {
    bcs: {
      path: "02_English_Language_and_Literature/PART-I_Language/Words/Antonyms",
      topic: "Antonyms",
      subtopic: "Antonyms",
    },
    bank: {
      path: "02_English_Language_and_Literature/PART-I_Language/Words_Vocabulary/Synonyms_and_Antonyms",
      topic: "Synonyms_and_Antonyms",
      subtopic: "Antonyms",
    },
  },
};

type GrammarRecord = {
  topic: string;
  slug: string;
  n: number;
  question: string;
  options: string[];
  answerLetter: string;
  explanation: string;
};

export function parseMdFile(file: string, content: string): { records: GrammarRecord[]; skipped: string[] } {
  const topic = file.replace(/\.md$/, "");
  const slug = slugify(topic);
  const records: GrammarRecord[] = [];
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
      const optM = line.match(/^([A-D])\)\s*(.*)$/);
      if (optM) {
        options.push(optM[2]);
        continue;
      }
      const ansM = line.match(/^Ans:\s*([A-D])\s*$/);
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

export async function importGrammarEnglish(prisma: PrismaClient, opts?: { dryRun?: boolean }) {
  const report = { files: 0, parsed: 0, inserted: 0, updated: 0, skipped: 0, rejected: 0, topics: {} as Record<string, number> };
  const dryRun = opts?.dryRun ?? process.argv.includes("--dry-run");

  const bcs = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  const bb = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!bcs || !bb) throw new Error("BCS / BANGLADESH_BANK ecosystems missing");
  const bcsSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bcs.id, nameBn: "English Language and Literature" },
  });
  const bankSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bb.id, nameBn: "02_English_Language_and_Literature" },
  });
  if (!bcsSubject) throw new Error("BCS English subject missing");
  if (!bankSubject) throw new Error("Bank English subject missing");

  const topicRows = await prisma.topic.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
  });
  const topicIdByKey = new Map(topicRows.map((t) => [`${t.subjectId}|${t.path}`, t.id]));
  // Fail loudly if a route path has no Topic row (Practice tree would hide it).
  for (const [slug, route] of Object.entries(TOPIC_ROUTE)) {
    if (!topicIdByKey.has(`${bcsSubject.id}|${route.bcs.path}`)) {
      throw new Error(`BCS Topic path missing for '${slug}': ${route.bcs.path}`);
    }
    if (!topicIdByKey.has(`${bankSubject.id}|${route.bank.path}`)) {
      throw new Error(`Bank Topic path missing for '${slug}': ${route.bank.path}`);
    }
  }

  const files = readdirSync(MD_DIR).filter((f) => f.endsWith(".md")).sort();
  if (files.length === 0) throw new Error(`No .md files in ${MD_DIR} — run docx-grammar-to-md.py first`);

  // Global duplicate identity: same normalized MCQ may exist only once per subject.
  const globalSigs = new Set<string>();
  const existingForDedup = await prisma.question.findMany({
    where: { subjectId: { in: [bcsSubject.id, bankSubject.id] } },
    select: { subjectId: true, question: true, correctAnswer: true, explanation: true },
  });
  for (const r of existingForDedup) {
    globalSigs.add(`${r.subjectId}|${mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation })}`);
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

      const route = TOPIC_ROUTE[r.slug];
      if (!route) {
        report.skipped += 1;
        console.warn(`  [skip] ${file} Q#${r.n}: no taxonomy route for slug '${r.slug}'`);
        continue;
      }

      const sig = mcaSignature({
        question: r.question,
        options: r.options,
        correctAnswer: r.options[answerIdx],
        explanation: r.explanation,
      });
      const targets = [
        { subject: bcsSubject, eco: bcs, dest: route.bcs },
        { subject: bankSubject, eco: bb, dest: route.bank },
      ];
      for (const t of targets) {
        if (globalSigs.has(`${t.subject.id}|${sig}`)) {
          report.skipped += 1;
          console.warn(`  [skip] ${file} Q#${r.n}: already in ${t.eco.code} database`);
          continue;
        }
        globalSigs.add(`${t.subject.id}|${sig}`);
        const key = sourceKey(t.subject.id, `grammar-english:${r.slug}`, r.question, r.options.join(" | "));
        ops.push({
          key,
          data: {
            ecosystemId: t.eco.id,
            subjectId: t.subject.id,
            topicId: topicIdByKey.get(`${t.subject.id}|${t.dest.path}`) ?? null,
            topic: t.dest.topic,
            subtopic: t.dest.subtopic,
            path: t.dest.path,
            question: r.question,
            options: r.options,
            correctAnswer: r.options[answerIdx],
            explanation: r.explanation,
            difficulty: "MEDIUM",
            year: null,
            sourceExam: `English Grammar · ${r.topic}`,
            questionNumber: r.n,
          },
        });
      }
    }
    console.log(`  ✓ ${file}: ${records.length} parsed`);
  }

  if (dryRun) {
    console.log(`\n[dry-run] ready to import: ${ops.length} (no writes)`);
    return report;
  }

  // Upsert per subject (sourceKey is unique per subjectId).
  const subjectIds = [bcsSubject.id, bankSubject.id];
  for (const sid of subjectIds) {
    const subOps = ops.filter((o) => o.data.subjectId === sid);
    const existing = await prisma.question.findMany({
      where: { subjectId: sid, sourceKey: { in: subOps.map((o) => o.key) } },
      select: { sourceKey: true },
    });
    const existingKeys = new Set(existing.map((e) => e.sourceKey));
    const fresh = subOps.filter((o) => !existingKeys.has(o.key));
    const stale = subOps.filter((o) => existingKeys.has(o.key));
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
            where: { subjectId_sourceKey: { subjectId: sid, sourceKey: o.key } },
            data: o.data,
          }),
        ),
      );
      report.updated += stale.length;
    }
  }
  for (const o of ops) {
    const t = `${o.data.ecosystemId === bcs.id ? "BCS" : "BANK"}:${o.data.topic as string}`;
    report.topics[t] = (report.topics[t] ?? 0) + 1;
  }
  // Practice selection tree caches counts — bust it so the new pool shows up.
  if (!dryRun && (report.inserted > 0 || report.updated > 0)) {
    await invalidateExamTreeSafe();
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
    const report = await importGrammarEnglish(prisma);
    console.log(`\n✓ Done. files=${report.files} parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped} rejected=${report.rejected}`);
    for (const [t, c] of Object.entries(report.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-grammar-english.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

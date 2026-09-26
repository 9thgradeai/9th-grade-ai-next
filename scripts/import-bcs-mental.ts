/**
 * scripts/import-bcs-mental.ts
 * ----------------------------------------------------------------------------
 * Imports BCS Mental Ability MCQ files (database/data/ques/Mental Ablity/*.txt)
 * into the BCS "মানসিক দক্ষতা" subject ONLY. Never touches Bank content.
 *
 * Source format (single logical line per record, physical wrapping tolerated):
 *   `০১. <question> ক. <a> খ. <b> গ. <c> ঘ. <d> Ans. <L>. <text> ব্যাখ্যা: <exp>`
 * with Bengali numerals and markers (ক/খ/গ/ঘ). The embedded answer TEXT is
 * validated against the option at the stated letter — mismatches are skipped,
 * never force-fitted.
 *
 * Pipeline (same contract as scripts/import-bank-ict.ts): parse + validate →
 * topic routing under 09_মানসিক_দক্ষতা → deterministic round-robin option
 * balancing (grading is text-based; explanations never reference positions) →
 * batched idempotent upserts by [subjectId, sourceKey].
 *
 * Run: `npx tsx scripts/import-bcs-mental.ts` (uses DATABASE_URL).
 * ----------------------------------------------------------------------------
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { PrismaClient, Prisma } from "@prisma/client";
import { sourceKey } from "./seed-keys";
import { balanceOptions } from "./import-bank-ict";

const MENTAL_DIR = join(process.cwd(), "database", "data", "ques", "Mental Ablity");
const BCS_MENTAL_NAMEBN = "মানসিক দক্ষতা";

const S = "09_মানসিক_দক্ষতা";
const T = {
  verbal: `${S}/০১_ভাষাগত_যৌক্তিক_বিচার_Verbal_Reasoning`,
  problem: `${S}/০২_সমস্যা_সমাধান_Problem_Solving`,
  numerical: `${S}/০৬_সংখ্যাগত_ক্ষমতা_Numerical_Ability`,
};

export type MentalRecord = {
  n: number;
  question: string;
  options: [string, string, string, string];
  answerLetter: "ক" | "খ" | "গ" | "ঘ";
  explanation: string;
};

export type ParsedMentalFile = { file: string; records: MentalRecord[]; skipped: string[] };

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const LETTERS = ["ক", "খ", "গ", "ঘ"] as const;

export function bnToNumber(s: string): number {
  return Number([...s.trim()].map((c) => {
    const i = BN_DIGITS.indexOf(c);
    return i >= 0 ? String(i) : c;
  }).join(""));
}

export function fileSlug(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.includes("verbal")) return "verbal-reasoning";
  if (n.includes("numerical")) return "numerical-ability";
  return "problem-solving";
}

export function routeTopic(slug: string): string {
  if (slug === "verbal-reasoning") return T.verbal;
  if (slug === "numerical-ability") return T.numerical;
  return T.problem;
}

/**
 * Parse one Mental Ability file (pure — unit-testable). Physical lines are
 * grouped into logical records starting at Bengali-numbered lines; each
 * record must carry exactly the ordered markers ক/খ/গ/ঘ, an `Ans. L. text`
 * whose text matches the option at L, and a `ব্যাখ্যা:` explanation.
 */
export function parseMentalFile(fileName: string, text: string): ParsedMentalFile {
  const records: MentalRecord[] = [];
  const skipped: string[] = [];
  const slug = fileSlug(fileName);

  const buffers: { startLine: number; lines: string[] }[] = [];
  let current: { startLine: number; lines: string[] } | null = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    if (/^[০-৯]+\.\s/.test(line)) {
      if (current) buffers.push(current);
      current = { startLine: i + 1, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    } else {
      skipped.push(`line ${i + 1}: outside any record: ${line.slice(0, 80)}`);
    }
  });
  if (current) buffers.push(current);

  for (const buf of buffers) {
    const joined = buf.lines.join(" ");
    const rec = parseMentalRecord(joined);
    if (rec) records.push(rec);
    else skipped.push(`line ${buf.startLine}: unparseable record (${slug} #?): ${joined.slice(0, 100)}`);
  }
  return { file: fileName, records, skipped };
}

function parseMentalRecord(text: string): MentalRecord | null {
  const nMatch = text.match(/^([০-৯]+)\.\s+([\s\S]*)$/);
  if (!nMatch) return null;
  const n = bnToNumber(nMatch[1]);
  if (!Number.isInteger(n) || n <= 0) return null;
  const rest = nMatch[2];

  // Locate every ` <L>. ` marker; the record is valid if SOME consecutive
  // run of four reads exactly ক/খ/গ/ঘ and its tail parses as answer +
  // explanation. (The answer itself — `Ans. ক. …` — adds a fifth marker,
  // and prose may contain lookalikes, so positional splitting is unsafe.)
  const marks: { letter: string; index: number; end: number }[] = [];
  const re = /\s([কখগঘ])\.\s/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rest)) !== null) {
    marks.push({ letter: m[1], index: m.index, end: m.index + m[0].length });
  }
  for (let s = 0; s + 3 < marks.length; s++) {
    if (
      marks[s].letter !== "ক" ||
      marks[s + 1].letter !== "খ" ||
      marks[s + 2].letter !== "গ" ||
      marks[s + 3].letter !== "ঘ"
    ) {
      continue;
    }
    const question = rest.slice(0, marks[s].index).trim();
    const tail = rest.slice(marks[s + 3].end);
    const options = [
      rest.slice(marks[s].end, marks[s + 1].index).trim(),
      rest.slice(marks[s + 1].end, marks[s + 2].index).trim(),
      rest.slice(marks[s + 2].end, marks[s + 3].index).trim(),
    ];
    if (!question || options.some((o) => !o)) continue;
    // The answer may appear more than once (typo-duplicated `Ans.`); try
    // each occurrence in order and accept the first fully-valid parse.
    const ansPositions: number[] = [];
    const ansRe = /\sAns\.\s/g;
    let am: RegExpExecArray | null;
    while ((am = ansRe.exec(tail)) !== null) ansPositions.push(am.index);
    for (const pos of ansPositions) {
      const optD = tail.slice(0, pos).trim();
      if (!optD) continue;
      const fullOpts = [...options, optD] as [string, string, string, string];
      const parsed = matchAnswer(tail.slice(pos), fullOpts);
      if (parsed) {
        if (parsed.normalized) {
          console.warn(`  [normalized] parenthetical answer remark dropped (record #${n}): ${question.slice(0, 60)}`);
        }
        return { n, question, options: fullOpts, answerLetter: parsed.letter, explanation: parsed.explanation };
      }
    }
  }
  return null;
}

/**
 * Match `Ans. L. <text> ব্যাখ্যা: <exp>` at the head of `text`. Accepts an
 * answer or option text carrying a trailing parenthetical remark
 * (`32F (নোট)` / option `F (বা …)`) when stripping it yields an exact match —
 * the remark is dropped (or never stored) and reported via `normalized`;
 * correctAnswer always stays the full displayed option text.
 */
function matchAnswer(
  text: string,
  options: [string, string, string, string],
): { letter: MentalRecord["answerLetter"]; explanation: string; normalized: boolean } | null {
  const ansMatch = text.match(/^\s*Ans\.\s*([কখগঘ])\.\s+([\s\S]*?)\s+ব্যাখ্যা:\s*([\s\S]*\S)?\s*$/);
  if (!ansMatch) return null;
  const [, letter, answerText] = ansMatch;
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  const want = answerText.trim();
  const strip = (s: string) => s.replace(/\s*\(.*?\)\s*$/, "").trim();
  if (options[idx] === want) {
    return { letter: letter as MentalRecord["answerLetter"], explanation: (ansMatch[3] ?? "").trim(), normalized: false };
  }
  if (strip(options[idx]) === strip(want) && strip(want)) {
    return { letter: letter as MentalRecord["answerLetter"], explanation: (ansMatch[3] ?? "").trim(), normalized: true };
  }
  return null;
}

export type MentalImportReport = {
  files: number;
  parsed: number;
  inserted: number;
  updated: number;
  skippedRecords: number;
  topics: Record<string, number>;
};

export async function importBcsMental(prisma: PrismaClient): Promise<MentalImportReport> {
  const bcs = await prisma.examEcosystem.findUnique({ where: { code: "BCS" } });
  if (!bcs) throw new Error("BCS ecosystem missing — run the seed first");
  const subject = await prisma.subject.findUnique({
    where: { ecosystemId_nameBn: { ecosystemId: bcs.id, nameBn: BCS_MENTAL_NAMEBN } },
  });
  if (!subject) throw new Error(`BCS subject "${BCS_MENTAL_NAMEBN}" missing — run the seed first`);

  const topicRows = await prisma.topic.findMany({ where: { subjectId: subject.id }, select: { id: true, path: true } });
  const topicIdByPath = new Map(topicRows.map((t) => [t.path, t.id]));

  const files = readdirSync(MENTAL_DIR).filter((f) => f.endsWith(".txt")).sort();
  const report: MentalImportReport = { files: files.length, parsed: 0, inserted: 0, updated: 0, skippedRecords: 0, topics: {} };

  type Op = { key: string; topicPath: string; data: Prisma.QuestionCreateManyInput };
  const ops: Op[] = [];

  for (const file of files) {
    const slug = fileSlug(file);
    const parsed = parseMentalFile(file, readFileSync(join(MENTAL_DIR, file), "utf8"));
    report.parsed += parsed.records.length;
    report.skippedRecords += parsed.skipped.length;
    for (const s of parsed.skipped) console.warn(`  [skip] ${file}: ${s}`);
    const seenText = new Set<string>();
    for (const r of parsed.records) {
      if (r.question.length < 3) {
        report.skippedRecords++;
        continue;
      }
      // Identity = stem + all four options: same-stem records with different
      // options (e.g. odd-one-out stems) are distinct questions.
      const textKey = r.question.trim().toLowerCase() + "\n" + r.options.join("\n");
      if (seenText.has(textKey)) {
        report.skippedRecords++;
        console.warn(`  [skip] ${file}: duplicate of #${r.n} in-file: ${r.question.slice(0, 70)}`);
        continue;
      }
      seenText.add(textKey);
      const topicPath = routeTopic(slug);
      ops.push({
        key: sourceKey(subject.id, "bcs-mental", slug, r.n, r.question),
        topicPath,
        data: {
          sourceKey: "",
          ecosystemId: bcs.id,
          subjectId: subject.id,
          topicId: topicIdByPath.get(topicPath) ?? null,
          topic: topicPath.split("/").pop() ?? "",
          subtopic: "",
          path: topicPath,
          question: r.question,
          options: r.options,
          correctAnswer: r.options[LETTERS.indexOf(r.answerLetter)],
          explanation: r.explanation,
          difficulty: "MEDIUM",
          year: null,
          sourceExam: `BCS Mental · ${slug}`,
          questionNumber: r.n,
        },
      });
    }
    console.log(`  ✓ ${file}: ${parsed.records.length} parsed`);
  }

  // Deterministic round-robin balancing over sourceKey order (same contract
  // as the Bank ICT import): ~25% correct per slot, reproducible reruns.
  const ordered = [...ops].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  ordered.forEach((o, i) => {
    o.data.options = balanceOptions(o.data.options as [string, string, string, string], o.data.correctAnswer as string, i % 4, o.key);
  });

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
      data: chunk.map((o) => ({ ...o.data, sourceKey: o.key })),
    });
    report.inserted += chunk.length;
  }
  if (stale.length > 0) {
    await prisma.$transaction(
      stale.map((o) =>
        prisma.question.update({
          where: { subjectId_sourceKey: { subjectId: subject.id, sourceKey: o.key } },
          data: { ...o.data, sourceKey: o.key },
        }),
      ),
    );
    report.updated += stale.length;
  }
  for (const o of ops) report.topics[o.topicPath] = (report.topics[o.topicPath] ?? 0) + 1;
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
    const report = await importBcsMental(prisma);
    console.log(`\n✓ Done. files=${report.files} parsed=${report.parsed} inserted=${report.inserted} updated=${report.updated} skipped=${report.skippedRecords}`);
    for (const [t, c] of Object.entries(report.topics)) console.log(`    ${c} × ${t}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bcs-mental.ts")) {
  main().catch((e) => {
    console.error("Failed:", e);
    process.exit(1);
  });
}

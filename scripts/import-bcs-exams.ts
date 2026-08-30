/**
 * scripts/import-bcs-exams.ts
 * ----------------------------------------------------------------------------
 * Exam-library import pipeline for the BCS question corpus.
 *
 * Turns the Question Bank into a data-driven exam library by:
 *
 *   1. Bootstrapping the exam taxonomy that actually exists in the data:
 *        ExamCategory  "BCS"
 *        └── Exam      "BCS Preliminary"
 *            └── ExamPaper  31st, 32nd, …, 50th BCS
 *      Papers are created ONLY for exam terms present in the source data.
 *      Nothing is invented.
 *
 *   2. Reading database/data/question_bank/bcs/bcs_questions.json and
 *      validating/normalizing each record. Only structurally VALID MCQs are
 *      imported (question text + ≥4 options + a resolvable correct answer).
 *      Malformed records (OCR preamble, empty options, unresolved answer,
 *      unknown subject, duplicate) are counted and REPORTED — they are never
 *      silently discarded, and never force-fabricated into a fake question.
 *
 *   3. Upserting questions keyed by sourceKey = md5(subjectId|exam:<term>|question)
 *      — a distinct key space from the subject-wise corpus, so exam-wise rows
 *      never collide with (or overwrite) the subject-wise import. Re-runs are
 *      idempotent; ids and user rows stay stable.
 *
 * Run:
 *   npx tsx scripts/import-bcs-exams.ts            (apply)
 *   npx tsx scripts/import-bcs-exams.ts --dry-run  (validate + report only)
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Difficulty, type Provenance } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { SUBJECT_META } from "./taxonomy";

// ── Raw record shape as produced by the OCR/parse pipeline ──
export type RawBcsRecord = {
  examTerm?: string;
  examNum?: number;
  year?: number | null;
  subject?: string;
  qnum?: number;
  question?: string;
  options?: string[];
  correctAnswer?: string;
  explanation?: string;
};

const BN_TO_EN: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5",
  "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};
const bnToEn = (s: string) => (s || "").replace(/[০-৯]/g, (d) => BN_TO_EN[d]);
const enDigitsToBn = (n: number) =>
  String(n).replace(/[0-9]/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);

const LETTER_TO_IDX: Record<string, number> = {
  "ক": 0, "খ": 1, "গ": 2, "ঘ": 3,
  "a": 0, "b": 1, "c": 2, "d": 3,
};

// Patterns that mark a record as a preamble/note rather than a real MCQ.
const PREAMBLE_RE =
  /মোট প্রশ্ন|ভূমিকা|এই পরীক্ষায়|পরীক্ষায় \d+|প্রতিটি প্রশ্ন|সমাধান প্রদান|সলুশন|পরীক্ষার্থীদের|উপরের তথ্য/;

const normalizeText = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Resolve a stored answer to the OPTION TEXT (letter → option, or exact match). */
export function resolveCorrectAnswer(raw: string | undefined, options: string[]): string {
  const t = (raw ?? "").trim();
  if (!t) return "";
  // A leading Bangla/Latin option letter ("গ. …", "গ)", bare "গ") maps
  // deterministically to its option — a 1:1 index mapping, NOT a guess. We
  // only treat it as a letter-answer when the letter is followed by a visible
  // separator (. ) or by end-of-string, so "গণিত…" (a word that merely starts
  // with গ) is never misread as an answer letter.
  const letter = /^\(?\s*([কখগঘa-dA-D])\s*([\).]|$)/;
  const lm = t.match(letter);
  if (lm) {
    const idx = LETTER_TO_IDX[lm[1].toLowerCase()];
    if (idx !== undefined && options[idx]) return options[idx];
    return "";
  }
  // Whitespace-INSENSITIVE EXACT match against an option: recovers OCR
  // line-wrap, stray spaces, and spurious single spaces — but still a full-
  // string equality after stripping, so it never picks a fuzzy/partial answer.
  const norm = (s: string) => s.replace(/\s+/g, "").normalize("NFC");
  const target = norm(t);
  for (const o of options) {
    if (norm(o) === target) return o;
  }
  return "";
}

export type NormalizedBcs = {
  ok: true;
  examNum: number;
  paperTitleBn: string;
  termLabel: string;
  subject: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  year: number | null;
  questionNumber: number | null;
  examTerm: string;
} | {
  ok: false;
  reason: string;
};

/** Validate + clean one raw record. Importable only when ok. */
export function normalizeBcsRecord(raw: RawBcsRecord): NormalizedBcs {
  const examTerm = (raw.examTerm ?? "").trim();
  const parsedNum = typeof raw.examNum === "number" && raw.examNum > 0
    ? raw.examNum
    : Number(bnToEn(examTerm).match(/\d+/)?.[0] ?? "");
  const subject = normalizeText(raw.subject);
  const question = normalizeText(raw.question);
  const options = (raw.options ?? []).map(normalizeText).filter(Boolean);
  const explanation = normalizeText(raw.explanation);
  const year = typeof raw.year === "number" ? raw.year : raw.year == null ? null : Number(raw.year);

  if (!Number.isFinite(parsedNum) || parsedNum < 1) {
    return { ok: false, reason: `missing/invalid exam term (examTerm=${examTerm})` };
  }
  if (!subject) return { ok: false, reason: "missing subject" };
  if (!question || question.length < 5) return { ok: false, reason: "question text missing/too short" };
  if (PREAMBLE_RE.test(question)) return { ok: false, reason: "preamble/note record (not a usable MCQ)" };
  if (options.length < 4) return { ok: false, reason: `only ${options.length} option(s) (need 4)` };
  const correctAnswer = resolveCorrectAnswer(raw.correctAnswer, options);
  if (!correctAnswer) {
    return { ok: false, reason: `correct answer unresolvable (correctAnswer=${raw.correctAnswer ?? ""})` };
  }

  // Only preserve qnum when it is a plausible in-paper sequence number; OCR
  // qnum is frequently garbage (huge/zero) — treat implausible as unknown.
  const qn = typeof raw.qnum === "number" && raw.qnum >= 1 && raw.qnum <= 1000 ? raw.qnum : null;

  return {
    ok: true,
    examNum: parsedNum,
    paperTitleBn: `${enDigitsToBn(parsedNum)}তম বিসিএস প্রিলিমিনারি`,
    termLabel: `${parsedNum}th`,
    subject,
    question,
    options,
    correctAnswer,
    explanation,
    year,
    questionNumber: qn,
    examTerm: examTerm || `${parsedNum}th বিসিএস`,
  };
}

export type ImportReport = {
  totalFound: number;
  valid: number;
  imported: number;   // new rows written
  updated: number;    // existing rows refreshed
  duplicates: number; // collapsed within the batch by sourceKey
  invalid: number;    // structurally invalid / unresolvable
  unclassified: number; // valid but subject mapped to no Subject row
  malformed: RawBcsRecord[];
  byExam: Record<string, { found: number; imported: number; invalid: number }>;
};

const CATEGORY_SLUG = "bcs";
const EXAM_SLUG = "bcs-preliminary";

/**
 * Bootstrap the exam taxonomy (category → exam → papers). Papers are created
 * ONLY for exam terms that produced valid content, newest first.
 */
async function ensureExamTaxonomy(
  prisma: PrismaClient,
  terms: Map<number, { year: number | null; count: number }>,
): Promise<Map<number, number>> {
  const category = await prisma.examCategory.upsert({
    where: { slug: CATEGORY_SLUG },
    update: {},
    create: {
      slug: CATEGORY_SLUG, nameBn: "BCS", nameEn: "BCS",
      icon: "📘", color: "text-sky-400", bg: "bg-sky-500/10", sortOrder: 1,
    },
  });
  const exam = await prisma.exam.upsert({
    where: { slug: EXAM_SLUG },
    update: { categoryId: category.id, nameBn: "BCS প্রিলিমিনারি", nameEn: "BCS Preliminary", type: "PRELIMINARY" },
    create: {
      categoryId: category.id, slug: EXAM_SLUG,
      nameBn: "BCS প্রিলিমিনারি", nameEn: "BCS Preliminary",
      type: "PRELIMINARY", sortOrder: 1,
    },
  });

  const paperIds = new Map<number, number>();
  const sorted = [...terms.keys()].sort((a, b) => b - a);
  let order = 1;
  for (const n of sorted) {
    const meta = terms.get(n)!;
    const slug = `bcs-preliminary-${n}th`;
    const paper = await prisma.examPaper.upsert({
      where: { slug },
      update: {
        examId: exam.id,
        titleBn: `${enDigitsToBn(n)}তম বিসিএস প্রিলিমিনারি`,
        bcsTerm: n,
        termLabel: `${n}th`,
        year: meta.year ?? null,
        availableQuestions: meta.count,
        provenance: (meta.count > 0 ? "CURATED" : "UNKNOWN") as Provenance,
      },
      create: {
        examId: exam.id,
        slug,
        titleBn: `${enDigitsToBn(n)}তম বিসিএস প্রিলিমিনারি`,
        titleEn: `${n}th BCS Preliminary`,
        bcsTerm: n,
        termLabel: `${n}th`,
        year: meta.year ?? null,
        availableQuestions: meta.count,
        provenance: (meta.count > 0 ? "CURATED" : "UNKNOWN") as Provenance,
        sortOrder: order++,
      },
    });
    paperIds.set(n, paper.id);
  }
  return paperIds;
}

/** The real importer. Returns a report; respects dryRun by writing nothing. */
export async function importBcsExams(
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const dryRun = opts.dryRun ?? false;
  const file = join(process.cwd(), "database", "data", "question_bank", "bcs", "bcs_questions.json");
  const raw: RawBcsRecord[] = JSON.parse(readFileSync(file, "utf8"));

  const report: ImportReport = {
    totalFound: raw.length, valid: 0, imported: 0, updated: 0,
    duplicates: 0, invalid: 0, unclassified: 0, malformed: [], byExam: {},
  };

  const candidates: Array<Extract<NormalizedBcs, { ok: true }>> = [];
  const terms = new Map<number, { year: number | null; count: number }>();
  for (const r of raw) {
    const n = normalizeBcsRecord(r);
    if (!n.ok) {
      report.invalid++;
      report.malformed.push(r);
      continue;
    }
    candidates.push(n);
    const t = terms.get(n.examNum) ?? { year: null, count: 0 };
    if (n.year) t.year = n.year;
    t.count += 1;
    terms.set(n.examNum, t);
  }
  report.valid = candidates.length;

  for (const [n, t] of terms) report.byExam[String(n)] = { found: t.count, imported: 0, invalid: 0 };

  if (dryRun) {
    candidates.forEach((c) => { report.byExam[String(c.examNum)].imported += 1; });
    return report;
  }

  const paperIds = await ensureExamTaxonomy(prisma, terms);

  const subjectIdByNameBn = new Map<string, number>();
  for (const [i, meta] of SUBJECT_META.entries()) {
    const s = await prisma.subject.upsert({
      where: { nameBn: meta.nameBn },
      update: {},
      create: { nameBn: meta.nameBn, nameEn: meta.nameEn, icon: meta.icon, color: meta.color, bg: meta.bg, sortOrder: i },
    });
    subjectIdByNameBn.set(meta.nameBn.normalize("NFC"), s.id);
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const subjectId = subjectIdByNameBn.get(c.subject.normalize("NFC"));
    if (subjectId === undefined) {
      report.unclassified++;
      report.malformed.push({ examTerm: c.examTerm, examNum: c.examNum, subject: c.subject, question: c.question });
      continue;
    }
    const paperId = paperIds.get(c.examNum)!;
    const key = sourceKey(subjectId, `exam:${c.examNum}`, c.question);
    if (seen.has(key)) {
      report.duplicates++;
      continue;
    }
    seen.add(key);

    const content = {
      subjectId,
      topic: "", subtopic: "", path: "", topicId: null,
      question: c.question,
      options: c.options,
      correctAnswer: c.correctAnswer,
      explanation: c.explanation,
      difficulty: "MEDIUM" as Difficulty,
      year: c.year,
      sourceExam: c.examTerm,
      bcsTerm: c.examTerm,
      examId: paperId === undefined ? null : (await prisma.examPaper.findUnique({ where: { id: paperId }, select: { examId: true } }))?.examId ?? null,
      paperId,
      questionNumber: c.questionNumber,
    };

    const existing = await prisma.question.findUnique({
      where: { subjectId_sourceKey: { subjectId, sourceKey: key } },
      select: { id: true },
    });
    if (existing) {
      await prisma.question.update({ where: { subjectId_sourceKey: { subjectId, sourceKey: key } }, data: content });
      report.updated++;
    } else {
      await prisma.question.create({ data: { sourceKey: key, ...content } });
      report.imported++;
    }
    report.byExam[String(c.examNum)].imported += 1;
  }

  return report;
}

function printReport(r: ImportReport, dryRun: boolean): void {
  console.log("BCS Import");
  console.log("──────────");
  const terms = Object.keys(r.byExam).sort((a, b) => Number(b) - Number(a));
  for (const t of terms) {
    const b = r.byExam[t];
    console.log(`${t}th BCS:  ${b.found} found / ${b.imported} imported / ${b.invalid} invalid`);
  }
  console.log(`\nFound:         ${r.totalFound}`);
  console.log(`Valid:         ${r.valid}`);
  console.log(`Imported:      ${r.imported}`);
  console.log(`Updated:       ${r.updated}`);
  console.log(`Duplicates:    ${r.duplicates}`);
  console.log(`Invalid:       ${r.invalid}`);
  console.log(`Unclassified:  ${r.unclassified}`);
  if (r.malformed.length > 0) {
    console.log(`\nMalformed/invalid records: ${r.malformed.length}`);
    r.malformed.slice(0, 12).forEach((m, i) => {
      console.log(`  ${i + 1}. [${m.examTerm ?? "?"}] ${m.subject ?? "?"} — ${String(m.question ?? m.correctAnswer ?? "").slice(0, 64)}`);
    });
  }
  console.log(dryRun ? "(DRY RUN — no changes written)" : "Done.");
}

async function main() {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes("--dry-run");
  try {
    const report = await importBcsExams(prisma, { dryRun });
    printReport(report, dryRun);
  } catch (e) {
    console.error("BCS import failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bcs-exams.ts")) {
  main().catch((e) => {
    console.error("BCS import failed:", e);
    process.exit(1);
  });
}

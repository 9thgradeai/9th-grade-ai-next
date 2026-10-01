/**
 * scripts/import-bank-officer-exams.ts
 * ----------------------------------------------------------------------------
 * Exam-library import pipeline for 3 more Bangladesh Bank exams:
 *
 *   ExamCategory  "Bank"  (ecosystem BANGLADESH_BANK)
 *   ├── Exam  "Officer (General)"       →  Officer (General) 2022
 *   ├── Exam  "Officer (IT)"            →  JobID-10209, JobID-25105
 *   └── Exam  "Senior Officer (IT)"     →  JobID-10225, JobID-25104
 *
 * Papers are created ONLY for source files present in
 * database/data/question_bank/Bank/{Officer(General),Officer(IT),Senior Officer(IT)}.
 * Nothing is invented. Source text is imported VERBATIM (Unicode as-is,
 * NFC-normalized by the shared gate only) — no translation, no rewording.
 *
 * Two record formats:
 *   BN — Bengali multi-line (`০১.` stem, `ক.` options, `Ans.`, `ব্যাখ্যা:`),
 *        parsed by the shared parser in scripts/import-bank-exams.ts.
 *   IT — `QN.` records, single-line or multi-line, `A.`-style options,
 *        `Answer: X`, explanation via `Speed Shortcut:` (also tolerates the
 *        `SpeedShortcut:` no-space variant). Parsed below; records with
 *        missing/empty options or unresolvable answers are REPORTED invalid —
 *        never fabricated.
 *
 * Classification + import gate are shared (classifyBankSubject /
 * normalizeBankRecord): every MCQ lands in one of the 7 BB subjects.
 * Upserts keyed by sourceKey = md5(subjectId|exam:<paperSlug>|qnum|question)
 * — a distinct key space per paper, so re-runs are idempotent and never
 * collide with the subject-wise corpus or other exams.
 *
 * Run:
 *   npx tsx scripts/import-bank-officer-exams.ts            (apply)
 *   npx tsx scripts/import-bank-officer-exams.ts --dry-run  (validate + report only)
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Difficulty, type Provenance } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { scanMca } from "./qb-forensics/import-gate";
import {
  parseBankRecord,
  normalizeBankRecord,
  type RawBankRecord,
} from "./import-bank-exams";

const QB_BANK_DIR = join(process.cwd(), "database", "data", "question_bank", "Bank");

type PaperDef = {
  file: string;
  format: "bn" | "it";
  examSlug: string;
  slug: string;
  titleBn: string;
  titleEn: string;
  /** Null when the source carries no year — never fabricated. */
  year: number | null;
  sourceExam: string;
};

const EXAMS = [
  { slug: "officer-general", nameBn: "অফিসার (জেনারেল)", nameEn: "Officer (General)", sortOrder: 2 },
  { slug: "officer-it", nameBn: "অফিসার (আইটি)", nameEn: "Officer (IT)", sortOrder: 3 },
  { slug: "senior-officer-it", nameBn: "সিনিয়র অফিসার (আইটি)", nameEn: "Senior Officer (IT)", sortOrder: 4 },
] as const;

// ── Paper sources: filename → paper identity (slugs must stay stable) ───────
const PAPERS: PaperDef[] = [
  {
    file: "Officer(General)/Officer (General)-2022.txt",
    format: "bn",
    examSlug: "officer-general",
    slug: "officer-general-2022",
    titleBn: "অফিসার (জেনারেল) ২০২২",
    titleEn: "Officer (General) 2022",
    year: 2022,
    sourceExam: "Officer (General) 2022",
  },
  {
    file: "Officer(IT)/JobID-10209-Post_ Officer (IT).txt",
    format: "it",
    examSlug: "officer-it",
    slug: "officer-it-10209",
    titleBn: "Officer (IT) JobID-10209",
    titleEn: "Officer (IT) JobID-10209",
    year: null,
    sourceExam: "Officer (IT) JobID-10209",
  },
  {
    file: "Officer(IT)/JobID-25105-Post_ Officer (IT).txt",
    format: "it",
    examSlug: "officer-it",
    slug: "officer-it-25105",
    titleBn: "Officer (IT) JobID-25105",
    titleEn: "Officer (IT) JobID-25105",
    year: null,
    sourceExam: "Officer (IT) JobID-25105",
  },
  {
    file: "Senior Officer(IT)/JobID-10225-Post_ Senior Officer (IT).txt",
    format: "it",
    examSlug: "senior-officer-it",
    slug: "senior-officer-it-10225",
    titleBn: "Senior Officer (IT) JobID-10225",
    titleEn: "Senior Officer (IT) JobID-10225",
    year: null,
    sourceExam: "Senior Officer (IT) JobID-10225",
  },
  {
    file: "Senior Officer(IT)/JobID-25104-Post_ Senior Officer (IT).txt",
    format: "it",
    examSlug: "senior-officer-it",
    slug: "senior-officer-it-25104",
    titleBn: "Senior Officer (IT) JobID-25104",
    titleEn: "Senior Officer (IT) JobID-25104",
    year: null,
    sourceExam: "Senior Officer (IT) JobID-25104",
  },
];

// ── IT record parsing (`QN.` format) ─────────────────────────────────────────
// Records start at `QN.` and run to the next `QN.` (single-line or wrapped
// multi-line alike). Leading header lines (JobID/post names/BOM) are ignored.
const IT_Q_START = /^Q(\d+)\.\s*(.*)$/;
const LATIN_OPTION = ["a", "b", "c", "d"];

export function splitITRecords(text: string): string[][] {
  const out: string[][] = [];
  let current: string[] | null = null;
  const flush = () => {
    if (current && current.length > 0) out.push(current);
    current = null;
  };
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (IT_Q_START.test(line)) {
      flush();
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  flush();
  return out;
}

export type ParsedITRecord = {
  qnum: number | null;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

/**
 * Parse one `QN.` record (pure — unit-testable). Returns null for records
 * that cannot form a valid 4-option MCQ (missing/empty options, unresolvable
 * answer) — callers must REPORT these, never fill them in.
 */
export function parseITRecord(lines: string[]): ParsedITRecord | null {
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  const qm = joined.match(/^Q(\d+)\.\s*([\s\S]*)$/);
  if (!qm) return null;
  const qnum = Number(qm[1]);
  const body = qm[2].trim();

  const ansM = body.match(/Answer\s*:\s*([A-D])\b/i);
  if (!ansM || ansM.index === undefined) return null;
  const answerLetter = ansM[1].toLowerCase();
  const head = body.slice(0, ansM.index).trim();
  const tail = body.slice(ansM.index + ansM[0].length).trim();
  // `Speed Shortcut:` or the `SpeedShortcut:` no-space variant; absent marker
  // means no explanation — kept "" so the gate flags EMPTY_EXPLANATION.
  const explM = tail.match(/Speed\s*Shortcut\s*:\s*([\s\S]*)$/i);
  const explanation = explM ? explM[1].trim() : "";

  // Option markers `A.`–`D.`; the lookbehind skips in-stem occurrences such
  // as "Class A IP Address" (letter preceded by a letter/digit is content).
  const marks: Array<{ letter: string; index: number; end: number }> = [];
  const re = /(?<![A-Za-z0-9])([A-D])\.\s*/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(head)) !== null) {
    marks.push({ letter: mm[1].toLowerCase(), index: mm.index, end: mm.index + mm[0].length });
  }
  // Take the LAST consecutive a,b,c,d run (stray "A."-like in stems ignored).
  let run: typeof marks | null = null;
  for (let i = marks.length - 4; i >= 0; i--) {
    const seq = marks.slice(i, i + 4);
    if (seq.map((x) => x.letter).join("") === LATIN_OPTION.join("")) {
      run = seq;
      break;
    }
  }
  if (!run) return null;
  const question = head.slice(0, run[0].index).trim();
  const options = run.map((mk, i) =>
    (i + 1 < run!.length ? head.slice(mk.end, run![i + 1].index) : head.slice(mk.end)).trim(),
  );
  if (!question || options.some((o) => !o)) return null;

  const idx = LATIN_OPTION.indexOf(answerLetter);
  if (idx < 0 || !options[idx]) return null;
  return { qnum, question, options, correctAnswer: options[idx], explanation };
}

// ── BN record splitting (shared shape with import-bank-exams.ts) ─────────────
const BN_REC_START = /^\s*[০-৯0-9]+\s*\.\s*/;

function splitBNRecords(text: string): string[][] {
  const out: string[][] = [];
  let current: string[] | null = null;
  const flush = () => {
    if (current && current.length > 0) out.push(current);
    current = null;
  };
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (BN_REC_START.test(line)) {
      flush();
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  flush();
  return out;
}

export type OfficerImportReport = {
  totalFound: number;
  valid: number;
  imported: number;
  updated: number;
  duplicates: number;
  invalid: number;
  unclassified: number;
  byPaper: Record<string, { found: number; imported: number; invalid: number }>;
  bySubject: Record<string, number>;
  malformed: Array<{ paper: string; reason: string; preview: string }>;
};

const CATEGORY = { slug: "bank", nameBn: "ব্যাংক", nameEn: "Bank", icon: "🏦" };

export async function importBankOfficerExams(
  prisma: PrismaClient,
  opts: { dryRun?: boolean; lenient?: boolean } = {},
): Promise<OfficerImportReport> {
  const dryRun = opts.dryRun ?? false;
  const lenient = opts.lenient ?? false;
  const report: OfficerImportReport = {
    totalFound: 0, valid: 0, imported: 0, updated: 0,
    duplicates: 0, invalid: 0, unclassified: 0, byPaper: {}, bySubject: {}, malformed: [],
  };

  const ecosystem = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!ecosystem) throw new Error('ExamEcosystem "BANGLADESH_BANK" not found — run scripts/seed-bb-subjects.ts first');
  const ecosystemId = ecosystem.id;

  type Cand = {
    paperSlug: string;
    examSlug: string;
    year: number | null;
    sourceExam: string;
    subject: string;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
    questionNumber: number | null;
  };
  const candidates: Cand[] = [];

  for (const paper of PAPERS) {
    const text = readFileSync(join(QB_BANK_DIR, paper.file), "utf8");
    report.byPaper[paper.slug] = { found: 0, imported: 0, invalid: 0 };
    const fail = (reason: string, preview: string) => {
      report.invalid++;
      report.byPaper[paper.slug].invalid++;
      report.malformed.push({ paper: paper.slug, reason, preview });
    };

    if (paper.format === "bn") {
      for (const lines of splitBNRecords(text)) {
        report.totalFound++;
        report.byPaper[paper.slug].found++;
        const parsed = parseBankRecord(lines);
        if (!parsed) {
          fail("unparseable record", lines.join(" ").slice(0, 80));
          continue;
        }
        const raw: RawBankRecord = {
          ...parsed,
          paperSlug: paper.slug,
          year: paper.year ?? 0,
          sourceExam: paper.sourceExam,
        };
        const n = normalizeBankRecord(raw, { lenient });
        if (!n.ok) {
          fail(n.reason, parsed.question.slice(0, 80));
          continue;
        }
        candidates.push({
          paperSlug: paper.slug, examSlug: paper.examSlug, year: paper.year,
          sourceExam: paper.sourceExam, subject: n.subject, question: n.question,
          options: n.options, correctAnswer: n.correctAnswer, explanation: n.explanation,
          questionNumber: n.questionNumber,
        });
      }
    } else {
      for (const lines of splitITRecords(text)) {
        report.totalFound++;
        report.byPaper[paper.slug].found++;
        const parsed = parseITRecord(lines);
        if (!parsed) {
          fail("unparseable record", lines.join(" ").slice(0, 80));
          continue;
        }
        const raw: RawBankRecord = {
          ...parsed,
          paperSlug: paper.slug,
          year: paper.year ?? 0,
          sourceExam: paper.sourceExam,
        };
        const n = normalizeBankRecord(raw, { lenient });
        if (!n.ok) {
          fail(n.reason, parsed.question.slice(0, 80));
          continue;
        }
        candidates.push({
          paperSlug: paper.slug, examSlug: paper.examSlug, year: paper.year,
          sourceExam: paper.sourceExam, subject: n.subject, question: n.question,
          options: n.options, correctAnswer: n.correctAnswer, explanation: n.explanation,
          questionNumber: n.questionNumber,
        });
      }
    }
  }
  report.valid = candidates.length;

  if (dryRun) {
    for (const c of candidates) {
      report.byPaper[c.paperSlug].imported += 1;
      report.bySubject[c.subject] = (report.bySubject[c.subject] ?? 0) + 1;
    }
    return report;
  }

  // ── Exam taxonomy: Bank → 3 exams → 5 papers ──
  const category = await prisma.examCategory.upsert({
    where: { ecosystemId_slug: { ecosystemId, slug: CATEGORY.slug } },
    update: { nameBn: CATEGORY.nameBn, nameEn: CATEGORY.nameEn, icon: CATEGORY.icon },
    create: { ecosystemId, slug: CATEGORY.slug, nameBn: CATEGORY.nameBn, nameEn: CATEGORY.nameEn, icon: CATEGORY.icon, color: "text-amber-400", bg: "bg-amber-500/10", sortOrder: 1 },
  });
  const examIds = new Map<string, number>();
  for (const exam of EXAMS) {
    const row = await prisma.exam.upsert({
      where: { slug: exam.slug },
      update: { categoryId: category.id, nameBn: exam.nameBn, nameEn: exam.nameEn, type: "PRELIMINARY" },
      create: { categoryId: category.id, slug: exam.slug, nameBn: exam.nameBn, nameEn: exam.nameEn, type: "PRELIMINARY", sortOrder: exam.sortOrder },
    });
    examIds.set(exam.slug, row.id);
  }
  const paperIds = new Map<string, number>();
  for (const [i, paper] of PAPERS.entries()) {
    const examId = examIds.get(paper.examSlug)!;
    const count = candidates.filter((c) => c.paperSlug === paper.slug).length;
    const row = await prisma.examPaper.upsert({
      where: { slug: paper.slug },
      update: { examId, titleBn: paper.titleBn, year: paper.year, availableQuestions: count, provenance: (count > 0 ? "CURATED" : "UNKNOWN") as Provenance },
      create: {
        examId, slug: paper.slug, titleBn: paper.titleBn, titleEn: paper.titleEn,
        year: paper.year, availableQuestions: count, provenance: (count > 0 ? "CURATED" : "UNKNOWN") as Provenance, sortOrder: i + 1,
      },
    });
    paperIds.set(paper.slug, row.id);
  }

  // BB subjects in this ecosystem.
  const bbSubjects = await prisma.subject.findMany({ where: { ecosystemId }, select: { id: true, nameBn: true } });
  const subjectIdByName = new Map(bbSubjects.map((s) => [s.nameBn.normalize("NFC"), s.id]));

  const seen = new Set<string>();
  for (const c of candidates) {
    // Defense in depth: normalizeBankRecord already gated this record, but
    // re-verify the EXACT payload we persist converges through the canonical
    // gate — so no future edit can silently route ungated text to the DB.
    const verify = scanMca({
      question: c.question,
      options: c.options,
      correctAnswer: c.correctAnswer,
      explanation: c.explanation,
    });
    if (verify.verdict === "REJECT") {
      report.invalid++;
      report.malformed.push({ paper: c.paperSlug, reason: `re-verify gate: ${verify.fatal.map((f) => f.code).join(", ")}`, preview: c.question.slice(0, 80) });
      continue;
    }
    const subjectId = subjectIdByName.get(c.subject.normalize("NFC"));
    if (subjectId === undefined) {
      report.unclassified++;
      continue;
    }
    const examId = examIds.get(c.examSlug)!;
    const paperId = paperIds.get(c.paperSlug)!;
    const key = sourceKey(subjectId, `exam:${c.paperSlug}`, String(c.questionNumber ?? 0), c.question);
    if (seen.has(key)) {
      report.duplicates++;
      continue;
    }
    seen.add(key);

    const content = {
      ecosystemId,
      subjectId,
      topic: "", subtopic: "", path: "", topicId: null,
      question: c.question,
      options: c.options,
      correctAnswer: c.correctAnswer,
      explanation: c.explanation,
      difficulty: "MEDIUM" as Difficulty,
      year: c.year,
      sourceExam: c.sourceExam,
      bcsTerm: null,
      examId,
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
    report.byPaper[c.paperSlug].imported += 1;
    report.bySubject[c.subject] = (report.bySubject[c.subject] ?? 0) + 1;
  }
  return report;
}

function printReport(r: OfficerImportReport, dryRun: boolean): void {
  console.log("Bank Import — Officer (General) / Officer (IT) / Senior Officer (IT)");
  console.log("─────────────────────────────────────────────────────────────────────");
  for (const [slug, b] of Object.entries(r.byPaper)) {
    console.log(`${slug}:  ${b.found} found / ${b.imported} imported / ${b.invalid} invalid`);
  }
  console.log("\nBy Bank subject:");
  for (const [s, n] of Object.entries(r.bySubject).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}  ${s}`);
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
    r.malformed.slice(0, 16).forEach((mm, i) => {
      console.log(`  ${i + 1}. [${mm.paper}] ${mm.reason} — ${mm.preview}`);
    });
  }
  console.log(dryRun ? "(DRY RUN — no changes written)" : "Done.");
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes("--dry-run");
  const lenient = process.argv.includes("--include-invalid") || process.argv.includes("--lenient") || process.argv.includes("--practice");
  try {
    const report = await importBankOfficerExams(prisma, { dryRun, lenient });
    printReport(report, dryRun);
  } catch (e) {
    console.error("Bank officer import failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-officer-exams.ts")) {
  main().catch((e) => {
    console.error("Bank officer import failed:", e);
    process.exit(1);
  });
}

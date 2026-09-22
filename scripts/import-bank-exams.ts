/**
 * scripts/import-bank-exams.ts
 * ----------------------------------------------------------------------------
 * Exam-library import pipeline for the Bangladesh Bank question corpus.
 *
 * Mirrors scripts/import-bcs-exams.ts, but for the Bank ecosystem:
 *
 *   1. Bootstraps the exam taxonomy that actually exists in the data:
 *        ExamCategory  "Bank"  (ecosystem BANGLADESH_BANK)
 *        └── Exam      "Senior Officer (General)"
 *            └── ExamPaper  Senior Officer (General) 2023,
 *                           Senior Officer (General)-II 2023
 *      Papers are created ONLY for source files present in
 *      database/data/question_bank/Bank/. Nothing is invented.
 *
 *   2. Parses each .txt paper (records start with a Bengali/Latin number +
 *      ".", options are `ক.`-style separated by pipes or whitespace, answers
 *      via `Ans.`/`উত্তর:`, explanations via `ব্যাখ্যা:`), classifies every
 *      MCQ into one of the 7 Bangladesh Bank subjects by keyword + script
 *      heuristics, and runs the shared import gate
 *      (scripts/qb-forensics/import-gate.ts). Rejected records are counted
 *      and REPORTED — never fabricated.
 *
 *   3. Upserts questions keyed by sourceKey =
 *      md5(subjectId|exam:<paperSlug>|question) — a distinct key space from
 *      the subject-wise corpus, so exam-wise rows never collide with (or
 *      overwrite) the subject-wise import. Re-runs are idempotent.
 *
 * Run:
 *   npx tsx scripts/import-bank-exams.ts            (apply)
 *   npx tsx scripts/import-bank-exams.ts --dry-run  (validate + report only)
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, type Difficulty, type Provenance } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const QB_BANK_DIR = join(process.cwd(), "database", "data", "question_bank", "Bank");

// ── Paper sources: filename → paper identity (slugs must stay stable) ───────
const PAPERS = [
  {
    file: "Senior Officer(General)/Senior Officer (General) 2023.txt",
    slug: "senior-officer-general-2023",
    titleBn: "সিনিয়র অফিসার (জেনারেল) ২০২৩",
    titleEn: "Senior Officer (General) 2023",
    year: 2023,
    sourceExam: "Senior Officer (General) 2023",
  },
  {
    file: "Senior Officer(General)/_Senior Officer (General)-II-2023.txt",
    slug: "senior-officer-general-ii-2023",
    titleBn: "সিনিয়র অফিসার (জেনারেল)-II ২০২৩",
    titleEn: "Senior Officer (General)-II 2023",
    year: 2023,
    sourceExam: "Senior Officer (General)-II 2023",
  },
];

// ── BB subject names (must match the BANGLADESH_BANK Subject rows) ──────────
const BB_BANGLA = "বাংলা ব্যাকরণ ও সাহিত্য";
const BB_ENGLISH = "English Grammar & Literature";
const BB_MATH = "সাধারণ গণিত";
const BB_ANALYTICAL = "বিশ্লেষণী দক্ষতা";
const BB_BANKING = "আর্থিক ও ব্যাংকিং জ্ঞান";
const BB_GK = "সাধারণ জ্ঞান";
const BB_ICT = "তথ্য ও যোগাযোগ প্রযুক্তি";

const has = (re: RegExp, s: string) => re.test(s);
const banglaRatio = (s: string) => {
  const bn = (s.match(/[\u0980-\u09FF]/g) ?? []).length;
  const lat = (s.match(/[A-Za-z]/g) ?? []).length;
  return bn + lat === 0 ? 0 : bn / (bn + lat);
};

// Bengali has no `\b` word boundaries (all \W), so short Bengali keywords
// need explicit lookarounds — otherwise e.g. সুদ matches inside মাসুদ.
const bnWord = (w: string) => `(?<![\u0980-\u09FFA-Za-z])${w}(?![\u0980-\u09FFA-Za-z])`;

// Keyword families (order matters — first match wins).
const ICT_RE = /computer|software|hardware|internet|e-?mail|network|hacking|hackers?|artificial intelligence|\bAI\b|keyboard|mouse|monitor|website|online|digital|কম্পিউটার|ই-?মেইল|সফটওয়্যার|হার্ডওয়্যার|ইন্টারনেট|হ্যাকিং|ওয়েবসাইট|ডিজিটাল/i;
const MATH_RE = new RegExp(
  String.raw`percent|percentage|ratio|probability|average|interest|equation|triangle|circle|square|cube|profit|loss|discount|fraction|speed|distance|coins?|dice|income|\bloan\b|wheel|revolution|perimeter|rectangle|diameter|mixture|\btrain\b|\bages\b|sum of|product of|\bTk\.?|taka|শতকরা|${bnWord("গড়")}|${bnWord("সুদ")}|${bnWord("লাভ")}|${bnWord("ক্ষতি")}|${bnWord("অনুপাত")}|সমীকরণ|${bnWord("গতি")}|দূরত্ব|${bnWord("বয়স")}|${bnWord("মুনাফা")}`,
  "i",
);
const BANKING_RE = /central bank|bangladesh bank|monetary policy|fiscal|budget|বাজেট|মুদ্রানীতি|কেন্দ্রীয় ব্যাংক|বাংলাদেশ ব্যাংক|অর্থনীতি|আর্থিক|ব্যাংকিং|বীমা|insurance|finance|financial|\bGDP\b|remittance|রেমিট্যান্স/i;
const GK_RE = /mountain|পর্বত|united nations|জাতিসংঘ|padma|পদ্মা|olympic|অলিম্পিক|games|award|পুরস্কার|capital|রাজধানী|president|রাষ্ট্রপতি|minister|মন্ত্রী|independence|স্বাধীনতা|museum|film|চলচ্চিত্র|movie|সিনেমা|sports|ক্রিকেট|football|ফুটবল|poverty|দারিদ্র্য|greenhouse|climate|জলবায়ু|nobel|নোবেল|\bwar\b|যুদ্ধ|treaty|চুক্তি|organization|সংস্থা|election|নির্বাচন|constitution|সংবিধান|history|ইতিহাস|geography|ভূগোল|hitler|gandhi|world cup|বিশ্বকাপ/i;
const BANGLA_RE = new RegExp(
  String.raw`ব্যাকরণ|ধ্বনি|বর্ণ|শব্দ|${bnWord("পদ")}|সন্ধি|সমাস|কারক|বাচ্য|উপসর্গ|প্রত্যয়|বানান|কবি|সাহিত্য|লেখক|উপন্যাস|গল্প|নাটক|কাব্য|পত্রিকা|ছন্দ|রবীন্দ্র|নজরুল|বিদ্যাসাগর|বঙ্কিম|শরৎ|${bnWord("অর্থ")}|সমার্থক|বিপরীতার্থক|এককথায়|বাগধারা|প্রবাদ|বিভক্তি|ণত্ব|ষত্ব|শুদ্ধ`,
  "i",
);

/**
 * Classify one MCQ into a Bangladesh Bank subject.
 * Pure — unit-testable without a database.
 */
export function classifyBankSubject(question: string, explanation: string): string {
  const text = `${question} ${explanation}`;
  if (has(ICT_RE, text)) return BB_ICT;
  if (has(MATH_RE, text)) return BB_MATH;
  if (has(BANKING_RE, text)) return BB_BANKING;
  if (has(GK_RE, text)) return BB_GK;
  if (banglaRatio(question) >= 0.5) {
    return has(BANGLA_RE, text) ? BB_BANGLA : BB_GK;
  }
  return BB_ENGLISH;
}

// ── Record parsing ──────────────────────────────────────────────────────────
export type RawBankRecord = {
  paperSlug: string;
  year: number;
  sourceExam: string;
  qnum: number | null;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

const REC_START = /^\s*[০-৯0-9]+\s*\.\s*/;
const BN_OPTION = ["ক", "খ", "গ", "ঘ"];

function splitRecords(text: string): string[][] {
  const out: string[][] = [];
  let current: string[] | null = null;
  const flush = () => {
    if (current && current.length > 0) out.push(current);
    current = null;
  };
  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (REC_START.test(line)) {
      flush();
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  flush();
  return out;
}

/** Parse one record's lines into question/options/answer/explanation. */
export function parseBankRecord(lines: string[]): Omit<RawBankRecord, "paperSlug" | "year" | "sourceExam"> | null {
  // Pipes are visual separators around option markers, not content.
  // Caret-superscripts (`cm^3`) are a mechanical notation variant of the
  // superscript forms (`cm³`) used in options — normalized on both sides so
  // identical quantities compare equal. NOT a guess.
  const caretSup = (s: string) => s.replace(/\^2\b/g, "²").replace(/\^3\b/g, "³");
  const joined = lines.join(" ").replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
  const explIdx = joined.search(/ব্যাখ্যা\s*:/);
  let head = joined;
  let explanation = "";
  if (explIdx >= 0) {
    explanation = joined.slice(explIdx).replace(/^ব্যাখ্যা\s*:\s*/, "").trim();
    head = joined.slice(0, explIdx).trim();
  }
  const ansM = head.match(/(উত্তর\s*:|Ans\.\s*|Answer\s*:)/i);
  if (!ansM || ansM.index === undefined) return null;
  const answerRaw = caretSup(head
    .slice(ansM.index + ansM[0].length)
    .trim()
    .replace(/^([কখগঘ])\s*\)/, "$1.")
    .replace(/\s+/g, " "));
  const qAndOpts = head.slice(0, ansM.index).trim();

  const markerRe = /([কখগঘ])\s*[.)]\s*/g;
  const marks: Array<{ letter: string; index: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(qAndOpts)) !== null) {
    marks.push({ letter: m[1], index: m.index, end: m.index + m[0].length });
  }
  if (marks.map((x) => x.letter).join("") !== BN_OPTION.join("")) return null;

  const rawQ = qAndOpts.slice(0, marks[0].index).trim();
  const qnumM = rawQ.match(/^\s*([০-৯0-9]+)\s*\.\s*/);
  const bn2en: Record<string, string> = { "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4", "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9" };
  const qnum = qnumM ? Number(qnumM[1].replace(/[০-৯]/g, (d) => bn2en[d])) : null;
  const question = rawQ.replace(REC_START, "").trim();
  const options = marks.map((mk, i) =>
    caretSup((i + 1 < marks.length ? qAndOpts.slice(mk.end, marks[i + 1].index) : qAndOpts.slice(mk.end)).trim()),
  );
  if (!question || options.some((o) => !o)) return null;

  // Resolve letter-answers to option text (same strict rule as the seeder).
  let correctAnswer = answerRaw;
  const head1 = answerRaw.charAt(0);
  const idx = BN_OPTION.indexOf(head1);
  if (idx >= 0 && options[idx]) {
    const rest = answerRaw.slice(1).replace(/^[।.)\s:]+/, "").trim();
    if (rest === "" || rest === options[idx]) correctAnswer = options[idx];
  }
  return { qnum, question, options, correctAnswer, explanation };
}

export type NormalizedBank = {
  ok: true;
  paperSlug: string;
  year: number;
  sourceExam: string;
  subject: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  questionNumber: number | null;
} | { ok: false; reason: string };

export function normalizeBankRecord(raw: RawBankRecord): NormalizedBank {
  if (!raw.question || raw.question.length < 3) return { ok: false, reason: "question text missing/too short" };
  if (raw.options.length < 4) return { ok: false, reason: `only ${raw.options.length} option(s) (need 4)` };
  const subject = classifyBankSubject(raw.question, raw.explanation);
  const gate = scanMca({
    question: raw.question,
    options: raw.options,
    correctAnswer: raw.correctAnswer,
    explanation: raw.explanation,
  });
  if (gate.verdict === "REJECT") {
    return { ok: false, reason: `failed import gate: ${gate.fatal.map((f) => f.code).join(", ")}` };
  }
  return {
    ok: true,
    paperSlug: raw.paperSlug,
    year: raw.year,
    sourceExam: raw.sourceExam,
    subject,
    question: gate.normalized.question,
    options: gate.normalized.options,
    correctAnswer: gate.normalized.correctAnswer,
    explanation: gate.normalized.explanation,
    questionNumber: raw.qnum,
  };
}

export type BankImportReport = {
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
const EXAM = { slug: "senior-officer-general", nameBn: "সিনিয়র অফিসার (জেনারেল)", nameEn: "Senior Officer (General)" };

export async function importBankExams(
  prisma: PrismaClient,
  opts: { dryRun?: boolean } = {},
): Promise<BankImportReport> {
  const dryRun = opts.dryRun ?? false;
  const report: BankImportReport = {
    totalFound: 0, valid: 0, imported: 0, updated: 0,
    duplicates: 0, invalid: 0, unclassified: 0, byPaper: {}, bySubject: {}, malformed: [],
  };

  const ecosystem = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  if (!ecosystem) throw new Error('ExamEcosystem "BANGLADESH_BANK" not found — run scripts/seed-bb-subjects.ts first');
  const ecosystemId = ecosystem.id;

  type Cand = Extract<NormalizedBank, { ok: true }>;
  const candidates: Cand[] = [];
  for (const paper of PAPERS) {
    const text = readFileSync(join(QB_BANK_DIR, paper.file), "utf8");
    const recs = splitRecords(text);
    report.byPaper[paper.slug] = { found: 0, imported: 0, invalid: 0 };
    for (const lines of recs) {
      report.totalFound++;
      report.byPaper[paper.slug].found++;
      const parsed = parseBankRecord(lines);
      if (!parsed) {
        report.invalid++;
        report.byPaper[paper.slug].invalid++;
        report.malformed.push({ paper: paper.slug, reason: "unparseable record", preview: lines.join(" ").slice(0, 80) });
        continue;
      }
      const n = normalizeBankRecord({ ...parsed, paperSlug: paper.slug, year: paper.year, sourceExam: paper.sourceExam });
      if (!n.ok) {
        report.invalid++;
        report.byPaper[paper.slug].invalid++;
        report.malformed.push({ paper: paper.slug, reason: n.reason, preview: parsed.question.slice(0, 80) });
        continue;
      }
      candidates.push(n);
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

  // ── Exam taxonomy: Bank → Senior Officer (General) → papers ──
  const category = await prisma.examCategory.upsert({
    where: { ecosystemId_slug: { ecosystemId, slug: CATEGORY.slug } },
    update: { nameBn: CATEGORY.nameBn, nameEn: CATEGORY.nameEn, icon: CATEGORY.icon },
    create: { ecosystemId, slug: CATEGORY.slug, nameBn: CATEGORY.nameBn, nameEn: CATEGORY.nameEn, icon: CATEGORY.icon, color: "text-amber-400", bg: "bg-amber-500/10", sortOrder: 1 },
  });
  const exam = await prisma.exam.upsert({
    where: { slug: EXAM.slug },
    update: { categoryId: category.id, nameBn: EXAM.nameBn, nameEn: EXAM.nameEn, type: "PRELIMINARY", totalQuestions: 100 },
    create: { categoryId: category.id, slug: EXAM.slug, nameBn: EXAM.nameBn, nameEn: EXAM.nameEn, type: "PRELIMINARY", totalQuestions: 100, sortOrder: 1 },
  });
  const paperIds = new Map<string, number>();
  for (const [i, paper] of PAPERS.entries()) {
    const count = candidates.filter((c) => c.paperSlug === paper.slug).length;
    const row = await prisma.examPaper.upsert({
      where: { slug: paper.slug },
      update: { examId: exam.id, titleBn: paper.titleBn, year: paper.year, availableQuestions: count, provenance: (count > 0 ? "CURATED" : "UNKNOWN") as Provenance },
      create: {
        examId: exam.id, slug: paper.slug, titleBn: paper.titleBn, titleEn: paper.titleEn,
        year: paper.year, availableQuestions: count, provenance: (count > 0 ? "CURATED" : "UNKNOWN") as Provenance, sortOrder: i + 1,
      },
    });
    paperIds.set(paper.slug, row.id);
  }

  // BB subjects in this ecosystem.
  const bbSubjects = await prisma.subject.findMany({ where: { ecosystemId }, select: { id: true, nameBn: true } });
  const subjectIdByName = new Map(bbSubjects.map((s) => [s.nameBn.normalize("NFC"), s.id]));

  const globalSigs = new Set<string>();
  for (const r of await prisma.question.findMany({ select: { question: true, correctAnswer: true, explanation: true } })) {
    globalSigs.add(mcaSignature({ question: r.question, options: [], correctAnswer: r.correctAnswer, explanation: r.explanation }));
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const subjectId = subjectIdByName.get(c.subject.normalize("NFC"));
    if (subjectId === undefined) {
      report.unclassified++;
      continue;
    }
    const paperId = paperIds.get(c.paperSlug)!;
    const key = sourceKey(subjectId, `exam:${c.paperSlug}`, c.question);
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
      examId: exam.id,
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
      const sig = mcaSignature({ question: c.question, options: c.options, correctAnswer: c.correctAnswer, explanation: c.explanation });
      if (globalSigs.has(sig)) {
        report.duplicates++;
        continue;
      }
      globalSigs.add(sig);
      await prisma.question.create({ data: { sourceKey: key, ...content } });
      report.imported++;
    }
    report.byPaper[c.paperSlug].imported += 1;
    report.bySubject[c.subject] = (report.bySubject[c.subject] ?? 0) + 1;
  }
  return report;
}

function printReport(r: BankImportReport, dryRun: boolean): void {
  console.log("Bank Import — Senior Officer (General)");
  console.log("──────────────────────────────────────");
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
    r.malformed.slice(0, 12).forEach((mm, i) => {
      console.log(`  ${i + 1}. [${mm.paper}] ${mm.reason} — ${mm.preview}`);
    });
  }
  console.log(dryRun ? "(DRY RUN — no changes written)" : "Done.");
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const dryRun = process.argv.includes("--dry-run");
  try {
    const report = await importBankExams(prisma, { dryRun });
    printReport(report, dryRun);
  } catch (e) {
    console.error("Bank import failed:", e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("import-bank-exams.ts")) {
  main().catch((e) => {
    console.error("Bank import failed:", e);
    process.exit(1);
  });
}

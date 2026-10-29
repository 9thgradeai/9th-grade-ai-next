/**
 * scripts/import-officer-general.ts
 * ------------------------------------------------------------
 * Imports Bangla MCQs from the three Officer (General) .txt files
 * into the Question Bank (Bank ecosystem) under the Bangla subject.
 *
 * Files:
 *   - Officer (General)_2022.txt
 *   - Officer (General)_2024.txt
 *   - Officer(General)_2022.txt
 *
 * Each file follows the Bangla MCQ format:
 *   <num>. <question>
 *   ক. <option>
 *   খ. <option>
 *   গ. <option>
 *   ঘ. <option>
 *   উত্তর: <letter>. <option text>
 *   ব্যাখ্যা: <explanation>
 *
 * The script handles both multiline and inline formats by detecting
 * question start via a leading number and dot, then extracting fields
 * using marker positions. It also normalizes alternative option markers
 * (e.g., "(ক) /") to standard format before parsing.
 * ------------------------------------------------------------ */
import { PrismaClient, type Prisma } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";
import { sourceKey } from "./seed-keys";
import { scanMca, mcaSignature } from "./qb-forensics/import-gate";

const OFFICER_DIR =
  "/Users/farhankabir/9th/9th-grade-ai-next/database/data/question_bank/Bank/Officer(General)";

const FILES = [
  "Officer (General)-2022.txt",
  "Officer (General)_2024.txt",
  "Officer(General)_2022.txt",
] as const;

const LETTERS = ["A", "B", "C", "D"];

type TxtRecord = {
  file: string;
  n: number;
  question: string;
  options: string[];
  answerLetter: string;
  explanation: string;
};

function yearFromFilename(name: string): string | null {
  const m = name.match(/(\d{4})/);
  return m ? m[1] : null;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const BN_TO_INDEX: Record<string, number> = { "ক": 0, "খ": 1, "গ": 2, "ঘ": 3 };
const LATIN_TO_INDEX: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };

function toAsciiDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
}

function recordNumber(raw: string): number {
  const n = Number.parseInt(toAsciiDigits(raw), 10);
  return Number.isFinite(n) ? n : NaN;
}

/** Map an answer letter (Bengali or Latin) to its A–D index, or -1. */
function answerIndexOf(letter: string): number {
  return BN_TO_INDEX[letter] ?? LATIN_TO_INDEX[letter.toUpperCase()] ?? -1;
}

/**
 * Parse one MCQ block. Records are either a single line (2024-style) or
 * several lines (2022-style); the block is joined before parsing.
 *
 * Only records with the Bengali ক/খ/গ/ঘ option markers are accepted. The
 * mixed 2022 file also contains English and mathematics sections (using
 * `(a)`/`Answer:` markers); those must never be imported as Bangla.
 */
function parseBlock(file: string, block: string): TxtRecord | null {
  const text = block.replace(/\s+/g, " ").trim();
  const start = text.match(/^([০-৯]+|\d+)\s*\.\s*/);
  if (!start) return null;

  const body = text.slice(start[0].length);

  // Collect Bengali option markers in source order. The answer line repeats
  // one marker, but the first ক,খ,গ,ঘ run is always the option list.
  const markerRe = /(?:^|\s)[（(]?([কখগঘ])[)\.]\s*/g;
  const markers: Array<{ letter: string; start: number; end: number }> = [];
  for (let m = markerRe.exec(body); m; m = markerRe.exec(body)) {
    const lead = m[0].length - m[0].trimStart().length;
    markers.push({ letter: m[1], start: m.index + lead, end: markerRe.lastIndex });
  }

  let optionsStart = -1;
  for (let i = 0; i + 3 < markers.length; i++) {
    if (
      markers[i].letter === "ক" &&
      markers[i + 1].letter === "খ" &&
      markers[i + 2].letter === "গ" &&
      markers[i + 3].letter === "ঘ"
    ) {
      optionsStart = i;
      break;
    }
  }
  if (optionsStart === -1) return null;

  const ka = markers[optionsStart]!;
  const kha = markers[optionsStart + 1]!;
  const ga = markers[optionsStart + 2]!;
  const gha = markers[optionsStart + 3]!;

  const question = body.slice(0, ka.start).trim();
  if (question.length < 3) return null;

  const tail = body.slice(gha.end);
  const answerMatch = /(?:উত্তর\s*[:ঃ]|Ans\s*[.:])\s*([কখগঘA-Da-d])/.exec(tail);
  if (!answerMatch) return null;

  const answerIdx = answerIndexOf(answerMatch[1]);
  if (answerIdx < 0) return null;

  const explanationMatch = /ব্যাখ্যা\s*:\s*/.exec(tail);
  const explanation = explanationMatch
    ? tail.slice(explanationMatch.index + explanationMatch[0].length).trim()
    : "";

  const options = [
    body.slice(ka.end, kha.start).trim(),
    body.slice(kha.end, ga.start).trim(),
    body.slice(ga.end, gha.start).trim(),
    tail.slice(0, answerMatch.index).trim(),
  ];
  if (options.some((o) => o.length === 0)) return null;

  return {
    file,
    n: recordNumber(start[1]),
    question,
    options,
    answerLetter: LETTERS[answerIdx],
    explanation,
  };
}

function parseBanglaTxt(file: string, content: string): {
  records: TxtRecord[];
  skipped: string[];
} {
  const records: TxtRecord[] = [];
  const skipped: string[] = [];
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const isQuestionStart = (line: string) => /^\s*(?:[০-৯]+|\d+)\s*\.\s*/.test(line);
  const isSectionHeader = (line: string) => /^\s*Section\b/i.test(line);

  for (let i = 0; i < lines.length; i++) {
    if (!isQuestionStart(lines[i])) continue;

    // A record runs until the next question or section header. Section
    // headers are boundaries, not content — the mixed file switches from
    // Bangla to English/math partway through.
    const block: string[] = [lines[i]];
    let j = i + 1;
    while (j < lines.length && !isQuestionStart(lines[j]) && !isSectionHeader(lines[j])) {
      block.push(lines[j]);
      j++;
    }

    const label = lines[i].trim().split(/\s+/)[0] ?? "?";
    const rec = parseBlock(file, block.join(" "));
    if (rec) records.push(rec);
    else skipped.push(`Q#${label}: not a Bengali 4-option MCQ`);
    i = j - 1;
  }

  return { records, skipped };
}

export async function importOfficerGeneral(prisma: PrismaClient, opts?: { dryRun?: boolean }) {
  const dryRun = opts?.dryRun ?? process.argv.includes("--dry-run");
  const report = {
    files: 0,
    parsed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    rejected: 0,
  };

  // Bangla subject (Bank ecosystem)
  const bankEcosystem = await prisma.examEcosystem.findUnique({ where: { code: "BANGLADESH_BANK" } });
  const banglaSubject = await prisma.subject.findFirst({
    where: { ecosystemId: bankEcosystem?.id, nameBn: "01_বাংলা_ভাষা_ও_সাহিত্য" },
  });
  if (!banglaSubject) throw new Error("Bangla subject not found for Bank ecosystem");

  // Topic: the root Bangla topic (leaf exists in taxonomy)
  const topicRow = await prisma.topic.findFirst({
    where: { subjectId: banglaSubject.id, path: "01_বাংলা_ভাষা_ও_সাহিত্য/সাহিত্য" },
  });
  if (!topicRow) throw new Error("Bangla root topic path not found");

  // Exam and Paper for Officer (General)
  const exam = await prisma.exam.findFirst({
    where: { nameEn: 'Officer (General)' },
  });
  if (!exam) throw new Error('Officer (General) exam not found');
  const examId = exam.id;

  async function getPaperId(yearStr: string): Promise<number> {
    const year = parseInt(yearStr);
    if (isNaN(year)) throw new Error(`Invalid year: ${yearStr}`);
    // Try to find existing paper
    const existing = await prisma.examPaper.findFirst({
      where: { examId, year: year },
    });
    if (existing) return existing.id;
    // Create new paper
    const paper = await prisma.examPaper.create({
      data: {
        examId,
        slug: `officer-general-${year}`,
        titleBn: `অফিসার (জেনারেল) ${year}`,
        titleEn: `Officer (General) ${year}`,
        year: year,
        heldOn: new Date(`${year}-01-01`),
        totalQuestions: null,
        availableQuestions: 0,
        source: '',
        provenance: 'UNKNOWN',
        verified: false,
        sortOrder: 0,
      },
    });
    return paper.id;
  }

  // Global deduplication set
  const existing = await prisma.question.findMany({
    where: { subjectId: banglaSubject.id },
    select: { subjectId: true, question: true, correctAnswer: true, explanation: true },
  });
  const existingSigs = new Set(
    existing.map((r) => `${r.subjectId}|${mcaSignature({
      question: r.question,
      options: [],
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
    })}`),
  );

  const ops: Array<{ key: string; data: Prisma.QuestionUncheckedCreateInput }> = [];

  for (const fname of FILES) {
    const fullPath = join(OFFICER_DIR, fname);
    const { records, skipped } = parseBanglaTxt(fname, readFileSync(fullPath, "utf8"));
    report.files++;
    report.parsed += records.length;
    report.skipped += skipped.length;
    for (const s of skipped) console.warn(`  [skip] ${fname}: ${s}`);

    const year = yearFromFilename(fname) ?? "";
    const sourceExam = `Officer (General) ${year}`;
    const paperId = await getPaperId(year);

    for (const r of records) {
      const answerIdx = LETTERS.indexOf(r.answerLetter);
      if (answerIdx < 0) {
        report.skipped++;
        console.warn(`  [skip] ${fname} Q#${r.n}: bad answer letter ${r.answerLetter}`);
        continue;
      }
      const gate = scanMca({
        question: r.question,
        options: r.options,
        correctAnswer: r.options[answerIdx],
        explanation: r.explanation,
      });
      if (gate.verdict === "REJECT") {
        report.rejected++;
        console.warn(
          `  [reject] ${fname} Q#${r.n}: ${gate.fatal.map((f) => f.code).join(",")}`
        );
        continue;
      }
      const sig = mcaSignature({
        question: r.question,
        options: r.options,
        correctAnswer: r.options[answerIdx],
        explanation: r.explanation,
      });
      const globalKey = `${banglaSubject.id}|${sig}`;
      if (existingSigs.has(globalKey)) {
        report.skipped++;
        continue;
      }
      existingSigs.add(globalKey);

      const key = sourceKey(
        banglaSubject.id,
        `officer-general:${year}`,
        r.question,
        r.options.join(" | "),
      );
      ops.push({
        key,
        data: {
          ecosystemId: bankEcosystem!.id,
          subjectId: banglaSubject.id,
          topicId: topicRow.id,
          path: "01_বাংলা_ভাষা_ও_সাহিত্য",
          topic: "Bangla",
          subtopic: "Officer (General)",
          examId,
          paperId: paperId,
          sourceExam,
          questionNumber: r.n,
          question: r.question,
          options: r.options,
          correctAnswer: r.options[answerIdx],
          explanation: r.explanation,
          difficulty: "MEDIUM",
          year: parseInt(year) || null,
        },
      });
    }
    console.log(`  ✓ ${fname}: ${records.length} parsed`);
  }

  if (dryRun) {
    console.log(`[dry‑run] would upsert ${ops.length} rows`);
    return report;
  }

  // Perform upserts (subject‑specific sourceKey uniqueness)
  const existingKeys = new Set(
    (await prisma.question.findMany({
      where: { subjectId: banglaSubject.id, sourceKey: { in: ops.map((o) => o.key) } },
      select: { sourceKey: true },
    })).map((r) => r.sourceKey)
  );

  const fresh = ops.filter((o) => !existingKeys.has(o.key));
  const stale = ops.filter((o) => existingKeys.has(o.key));

  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    await prisma.question.createMany({
      data: chunk.map((o) => ({ sourceKey: o.key, ...o.data })),
    });
    report.inserted += chunk.length;
  }
  if (stale.length) {
    await prisma.$transaction(
      stale.map((o) =>
        prisma.question.update({
          where: { subjectId_sourceKey: { subjectId: banglaSubject.id, sourceKey: o.key } },
          data: o.data,
        })
      )
    );
    report.updated += stale.length;
  }

  // Invalidate the exam‑tree cache so the UI picks up the new exams.
  try {
    const { QueryCache } = await import("../backend/infrastructure/cache/query-cache");
    await QueryCache.invalidateExamTree();
  } catch {}

  return report;
}

if (process.argv[1]?.endsWith("import-officer-general.ts")) {
  (async () => {
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      const rep = await importOfficerGeneral(prisma);
      console.log('\nImport finished:', rep);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
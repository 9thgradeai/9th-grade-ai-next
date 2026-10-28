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
 * Each file follows the same Bangla MCQ format:
 *   <num>. <question>
 *   A. <option>
 *   B. <option>
 *   C. <option>
 *   D. <option>
 *   উত্তর: <letter>. <option text>
 *   ব্যাখ্যা: <explanation>
 *
 * The script parses the files, validates them via the shared import‑gate
 * (scanMca), and upserts them using a deterministic sourceKey. The
 * `sourceExam` column now includes the year extracted from the filename
 * so the Question Bank UI shows separate exam headings.
 * ------------------------------------------------------------
 */
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

function parseBanglaTxt(file: string, content: string): {
  records: TxtRecord[];
  skipped: string[];
} {
  const records: TxtRecord[] = [];
  const skipped: string[] = [];
  const lines = content.split("\n");
  let cur: Partial<TxtRecord> | null = null;
  let opts: string[] = [];

  const flush = () => {
    if (!cur) return;
    if (!cur.question || cur.question.length < 3) {
      skipped.push(`Q#${cur.n}: empty/short question`);
    } else if (opts.length < 4) {
      skipped.push(`Q#${cur.n}: only ${opts.length} options`);
    } else if (!cur.answerLetter) {
      skipped.push(`Q#${cur.n}: missing answer`);
    } else {
      const answerIdx = LETTERS.indexOf(cur.answerLetter);
      if (answerIdx < 0 || !opts[answerIdx]) {
        skipped.push(`Q#${cur.n}: bad answer letter '${cur.answerLetter}'`);
      } else {
        records.push({
          file,
          n: cur.n,
          question: cur.question,
          options: opts,
          answerLetter: cur.answerLetter,
          explanation: cur.explanation,
        });
      }
    }
    cur = null;
    opts = [];
  };

  const qRe = /^(\d|[\u09E6-\u09EF]+)\.\s*(.*)$/;
  const optReEng = /^([A-D])\.\s*(.*)$/;
  const ansReBangla = /^উত্তর:\s*([A-D])\.\s*(.*)$/;
  const ansReAns = /^Ans\.?\s*([A-D\u0995-\u0998])\.?\s*(.*)$/;
  const expRe = /^ব্যাখ্যা:\s*(.*)$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    // Skip empty or header lines that don’t start a question
    if (!line || line.startsWith("Section") || line.startsWith("প্রশ্ন") || line.startsWith("Topic")) {
      continue;
    }
    const qMatch = line.match(qRe);
    if (qMatch) {
      // Inline style (question, all options, answer and explanation on one line)
      const inline = line.match(/^.*?ক\.\s*(.*?)\s*খ\.\s*(.*?)\s*গ\.\s*(.*?)\s*ঘ\.\s*(.*?)\s*উত্তর:\s*([A-D\u0995-\u0998])\.\s*(.*?)\s*ব্যাখ্যা:\s*(.*)$/);
      if (inline) {
        const [_full, optA, optB, optC, optD, ansLetterRaw, ansText, expl] = inline;
        const map = { "\u0995": "A", "\u0996": "B", "\u0997": "C", "\u0998": "D" };
        const ansLetter = map[ansLetterRaw] || ansLetterRaw;
        records.push({
          file,
          n: parseInt(qMatch[1]),
          question: qMatch[2].trim(),
          options: [optA, optB, optC, optD],
          answerLetter: ansLetter,
          explanation: expl.trim(),
        });
        // skip normal processing for this line
        continue;
      }
      flush();
      cur = { file, n: parseInt(qMatch[1]), question: qMatch[2] } as any;
      opts = [];
      continue;
    }
    if (!cur) continue;
    const optMatchEng = line.match(optReEng);
    const optMatchBeng = line.match(/^([\u0995-\u0998])\.\s*(.*)$/);
    if (optMatchEng) {
      opts.push(optMatchEng[2]);
      continue;
    }
    if (optMatchBeng) {
      // map Bengali option letters to A-D order based on appearance
      opts.push(optMatchBeng[2]);
      continue;
    }
    const ansMatchBangla = line.match(ansReBangla);
    const ansMatchAns = line.match(ansReAns);
    if (ansMatchBangla) {
      cur.answerLetter = ansMatchBangla[1];
      // map Bengali option letters to A-D
      const map = { "\u0995": "A", "\u0996": "B", "\u0997": "C", "\u0998": "D" };
      cur.answerLetter = map[cur.answerLetter] || cur.answerLetter;
      continue;
    }
    if (ansMatchAns) {
      cur.answerLetter = ansMatchAns[1];
      const map = { "\u0995": "A", "\u0996": "B", "\u0997": "C", "\u0998": "D" };
      cur.answerLetter = map[cur.answerLetter] || cur.answerLetter;
      continue;
    }
    const expMatch = line.match(expRe);
    if (expMatch) {
      cur.explanation = expMatch[1];
      continue;
    }
    // If we get here, treat it as a continuation of the question stem
    if (line && cur.question) {
      cur.question = (cur.question + " " + line).trim();
    }
  }
  flush();
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

  async function getPaperId(yearStr: string): Promise<number> {
    const year = parseInt(yearStr);
    if (isNaN(year)) throw new Error(`Invalid year: ${yearStr}`);
    // Try to find existing paper
    const existing = await prisma.examPaper.findFirst({
      where: { examId: exam.id, year: year },
    });
    if (existing) return existing.id;
    // Create new paper
    const paper = await prisma.examPaper.create({
      data: {
        examId: exam.id,
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
          examId: exam.id,
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
    const prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
    });
    try {
      const rep = await importOfficerGeneral(prisma);
      console.log('\nImport finished:', rep);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
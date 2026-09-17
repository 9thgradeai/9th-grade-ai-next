/**
 * scripts/qb-audit/inventory.ts
 * ----------------------------------------------------------------------------
 * Phase 2: Build a complete database/source inventory.
 * Scans 100% of question data from source files and optionally from the DB.
 * ----------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parseQuestionLine } from "../qb-forensics/parse-flat";
import type { InventoryReport, QuestionRecord } from "./types";

const DATA_DIR = join(process.cwd(), "database", "data", "ques");
const BCS_JSON = join(process.cwd(), "database", "data", "question_bank", "bcs", "bcs_questions.json");

function collectTxtFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.txt$/i.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
}

function extractSubjectName(filePath: string): string {
  const rel = filePath.replace(DATA_DIR + "/", "");
  const parts = rel.split("/");
  if (parts.length === 1) return "বিষয়সূচি";
  return parts[0];
}

export interface SourceScanResult {
  records: QuestionRecord[];
  inventory: InventoryReport;
}

export function scanSourceFiles(): SourceScanResult {
  const files = collectTxtFiles(DATA_DIR);
  const records: QuestionRecord[] = [];
  let id = 0;
  const subjectCounts: Record<string, number> = {};
  let totalLines = 0;
  let malformedFields = 0;
  let suspiciousEncoding = 0;
  let missingFields = 0;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    totalLines += lines.length;
    const subject = extractSubjectName(file);

    for (const line of lines) {
      const parsed = parseQuestionLine(line);
      if (!parsed) {
        malformedFields++;
        continue;
      }

      const hasEncoding =
        parsed.question.includes("\uFFFD") ||
        parsed.options.some((o) => o.includes("\uFFFD")) ||
        parsed.correctAnswer.includes("\uFFFD") ||
        parsed.explanation.includes("\uFFFD");
      if (hasEncoding) suspiciousEncoding++;

      const hasEmpty =
        !parsed.question ||
        parsed.options.some((o) => !o) ||
        !parsed.correctAnswer;
      if (hasEmpty) missingFields++;

      subjectCounts[subject] = (subjectCounts[subject] ?? 0) + 1;

      records.push({
        id: id++,
        source: "source-file",
        sourceFile: file,
        subjectName: subject,
        topic: "",
        subtopic: "",
        path: file.replace(DATA_DIR + "/", ""),
        question: parsed.question,
        options: parsed.options,
        correctAnswer: parsed.correctAnswer,
        explanation: parsed.explanation,
      });
    }
  }

  // Scan BCS JSON
  let bcsCount = 0;
  let bcsMalformed = 0;
  try {
    const bcsRaw = readFileSync(BCS_JSON, "utf8");
    const bcsData = JSON.parse(bcsRaw) as Array<{
      examTerm?: string;
      examNum?: number;
      year?: number;
      subject?: string;
      qnum?: number;
      question?: string;
      options?: string[];
      correctAnswer?: string;
      explanation?: string;
    }>;
    for (const item of bcsData) {
      if (!item.question || !item.options || item.options.length < 2) {
        bcsMalformed++;
        continue;
      }
      bcsCount++;
      const subject = item.subject || "BCS";
      subjectCounts[`BCS (${subject})`] = (subjectCounts[`BCS (${subject})`] ?? 0) + 1;

      records.push({
        id: id++,
        source: "source-file",
        sourceFile: BCS_JSON,
        subjectName: subject,
        topic: "",
        subtopic: "",
        path: `bcs/${item.examTerm || ""}`,
        question: item.question,
        options: item.options,
        correctAnswer: item.correctAnswer || "",
        explanation: item.explanation || "",
        bcsTerm: item.examTerm,
        year: item.year,
      });
    }
  } catch {
    // BCS JSON not available
  }

  const inventory: InventoryReport = {
    generatedAt: new Date().toISOString(),
    totalQuestions: records.length,
    totalOptions: records.reduce((s, r) => s + r.options.length, 0),
    totalExplanations: records.filter((r) => r.explanation).length,
    totalSubjects: Object.keys(subjectCounts).length,
    totalTopics: 0,
    totalSubtopics: 0,
    questionsPerSubject: subjectCounts,
    questionsPerExam: {},
    questionsWithMissingFields: missingFields,
    questionsWithMalformedFields: malformedFields + bcsMalformed,
    questionsWithSuspiciousEncoding: suspiciousEncoding,
    questionsWithInconsistentFormatting: 0,
    questionsWithDuplicateContent: 0,
    questionsWithSuspiciousAnswerMappings: 0,
    sourceFiles: files.length + 1,
    sourceLinesTotal: totalLines,
    dbRecords: 0,
  };

  return { records, inventory };
}

export async function scanDatabase(): Promise<InventoryReport> {
  // Dynamic import to avoid hard dependency when running in source-only mode
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const count = await prisma.question.count();
      const subjects = await prisma.subject.findMany({ select: { id: true, nameBn: true } });
      const subjectCounts: Record<string, number> = {};
      for (const s of subjects) {
        const c = await prisma.question.count({ where: { subjectId: s.id } });
        subjectCounts[s.nameBn] = c;
      }
      return {
        generatedAt: new Date().toISOString(),
        totalQuestions: count,
        totalOptions: 0,
        totalExplanations: 0,
        totalSubjects: subjects.length,
        totalTopics: 0,
        totalSubtopics: 0,
        questionsPerSubject: subjectCounts,
        questionsPerExam: {},
        questionsWithMissingFields: 0,
        questionsWithMalformedFields: 0,
        questionsWithSuspiciousEncoding: 0,
        questionsWithInconsistentFormatting: 0,
        questionsWithDuplicateContent: 0,
        questionsWithSuspiciousAnswerMappings: 0,
        sourceFiles: 0,
        sourceLinesTotal: 0,
        dbRecords: count,
      };
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      totalQuestions: 0,
      totalOptions: 0,
      totalExplanations: 0,
      totalSubjects: 0,
      totalTopics: 0,
      totalSubtopics: 0,
      questionsPerSubject: {},
      questionsPerExam: {},
      questionsWithMissingFields: 0,
      questionsWithMalformedFields: 0,
      questionsWithSuspiciousEncoding: 0,
      questionsWithInconsistentFormatting: 0,
      questionsWithDuplicateContent: 0,
      questionsWithSuspiciousAnswerMappings: 0,
      sourceFiles: 0,
      sourceLinesTotal: 0,
      dbRecords: 0,
    };
  }
}

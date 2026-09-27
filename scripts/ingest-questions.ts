/**
 * scripts/ingest-questions.ts
 * ----------------------------------------------------------------------------
 * Multi-format question ingestion validator and pipeline. Reads question
 * files from database/data/ques/ (flat .txt per-subject dumps, folder-
 * structured topic trees) and JSON/CSV exports, runs the shared import
 * gate (scripts/qb-forensics/import-gate.ts), and optionally upserts
 * questions into the database keyed by sourceKey — idempotent.
 *
 *   npx tsx scripts/ingest-questions.ts            (apply)
 *   npx tsx scripts/ingest-questions.ts --dry-run  (validate + report only)
 * ----------------------------------------------------------------------------
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { scanMca, type GateIssue, type McaInput } from "./qb-forensics/import-gate";
import { sourceKey } from "./seed-keys";

// ── Types ────────────────────────────────────────────────────────
interface IngestRecord {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  questionType?: string;
  correctAnswers?: string[];
  statements?: string[];
  source: string;
  subject: string;
}

interface IngestReport {
  files: number;
  parsed: number;
  accepted: number;
  rejected: number;
  inserted: number;
  updated: number;
  skipped: number;
  rejections: Array<{ file: string; index: number; issues: GateIssue[] }>;
}

// ── Collectors ──────────────────────────────────────────────────
function collectTxtFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".txt")) files.push(full);
    }
  };
  walk(join(process.cwd(), "database", "data", "ques"));
  return files;
}

// ── Parsers ─────────────────────────────────────────────────────

function parseTxtFile(filePath: string): IngestRecord[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const results: IngestRecord[] = [];
  const BANGLA = ["ক", "খ", "গ", "ঘ"];
  const LATIN = ["A", "B", "C", "D"];

  for (const line of lines) {
    const explanationIdx = line.indexOf("ব্যাখ্যা:");
    let explanation = "";
    let body = line;
    if (explanationIdx >= 0) {
      explanation = line.slice(explanationIdx + "ব্যাখ্যা:".length).trim();
      body = line.slice(0, explanationIdx);
    }

    const answerMarker = /(উত্তর\s*:)|(ans\.\s)/i;
    const m = answerMarker.exec(body);
    let answerRaw = "";
    let qAndOpts = body;
    if (m) {
      answerRaw = body.slice(m.index + m[0].length).trim();
      qAndOpts = body.slice(0, m.index);
    }

    const optBlock = matchOptionBlock(qAndOpts, BANGLA, LATIN);
    if (!optBlock) continue;
    const questionText = qAndOpts.slice(0, optBlock.match.index).replace(/^\s*[০-৯0-9]+\s*\.\s*/, "").trim();
    const options = [optBlock.match[1], optBlock.match[2], optBlock.match[3], optBlock.match[4]].map((s) => s.trim());
    if (!questionText || options.length < 2) continue;

    const correctAnswer = resolveAnswerToOption(answerRaw, options) ?? answerRaw;
    results.push({ question: questionText, options, correctAnswer, explanation, source: filePath, subject: "" });
  }
  return results;
}

function matchOptionBlock(body: string, markers1: string[], markers2: string[]): { match: RegExpMatchArray } | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const markers of [markers1, markers2]) {
    const re = new RegExp(
      `${esc(markers[0])} (.*) ${esc(markers[1])} (.*) ${esc(markers[2])} (.*) ${esc(markers[3])} (.*)$`,
    );
    const match = body.match(re);
    if (match) return { match };
  }
  return null;
}

function resolveAnswerToOption(answerRaw: string, options: string[]): string | null {
  if (!answerRaw) return null;
  const letters = ["ক", "খ", "গ", "ঘ", "A", "B", "C", "D"];
  const idx = letters.indexOf(answerRaw.trim()[0]);
  if (idx !== -1 && options[idx]) return options[idx];
  return options.find((o) => o === answerRaw.trim()) ?? null;
}

function parseJsonFile(filePath: string): IngestRecord[] {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const arr = Array.isArray(raw) ? raw : raw.questions ?? raw.items ?? [];
  return arr.map((item: any) => ({
    question: item.question ?? item.stem ?? "",
    options: item.options ?? item.choices ?? [],
    correctAnswer: item.correctAnswer ?? item.answer ?? "",
    explanation: item.explanation ?? "",
    questionType: item.questionType ?? item.type ?? undefined,
    correctAnswers: item.correctAnswers ?? item.correct_answers ?? undefined,
    statements: item.statements ?? undefined,
    source: filePath,
    subject: item.subject ?? "",
  }));
}

function parseCsvFile(filePath: string): IngestRecord[] {
  const content = readFileSync(filePath, "utf8");
  const lines = content.trim().split("\n");
  const header = lines[0]?.split(",").map((h) => h.trim().replace(/^"|"$/g, "")) ?? [];
  const records: IngestRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    header?.forEach((h, idx) => { obj[h] = vals[idx] ?? ""; });
    records.push({
      question: obj.question ?? obj.stem ?? "",
      options: (obj.options ?? obj.choices ?? "").split("|").filter(Boolean),
      correctAnswer: obj.correctAnswer ?? obj.correct_answer ?? obj.answer ?? "",
      explanation: obj.explanation ?? obj.explanationText ?? "",
      questionType: obj.questionType ?? obj.type ?? undefined,
      correctAnswers: obj.correctAnswers ?? obj.correct_answers ? (obj.correctAnswers ?? obj.correct_answers).split("|").filter(Boolean) : undefined,
      statements: obj.statements ? obj.statements.split("|").filter(Boolean) : undefined,
      source: filePath,
      subject: obj.subject ?? obj.topic ?? "",
    });
  }
  return records;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; }
    else { current += ch; }
  }
  result.push(current.trim());
  return result;
}

// ── Core ────────────────────────────────────────────────────────

export async function ingestQuestions(prisma: PrismaClient, dryRun = false): Promise<IngestReport> {
  const report: IngestReport = { files: 0, parsed: 0, accepted: 0, rejected: 0, inserted: 0, updated: 0, skipped: 0, rejections: [] };

  const allFiles = collectTxtFiles();
  report.files = allFiles.length;

  for (const filePath of allFiles) {
    const format = filePath.endsWith(".json") ? "json" : filePath.endsWith(".csv") ? "csv" : "txt";
    let parsed: IngestRecord[] = [];
    try {
      switch (format) {
        case "json": parsed = parseJsonFile(filePath); break;
        case "csv": parsed = parseCsvFile(filePath); break;
        default: parsed = parseTxtFile(filePath); break;
      }
    } catch { continue; }
    report.parsed += parsed.length;

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      if (!q.question || q.options.length < 2) continue;

      const gateInput: McaInput = { question: q.question, options: q.options, correctAnswer: q.correctAnswer, explanation: q.explanation, questionType: q.questionType, correctAnswers: q.correctAnswers, statements: q.statements };
      const gateResult = scanMca(gateInput);

      if (gateResult.verdict === "REJECT") {
        report.rejected++;
        report.rejections.push({ file: filePath, index: i, issues: gateResult.fatal });
        continue;
      }
      report.accepted++;

      if (dryRun) { report.skipped++; continue; }

      const key = sourceKey(q.subject || "unknown", filePath, q.question);
      const norm = gateResult.normalized;
      const data = {
        question: norm.question,
        options: norm.options,
        correctAnswer: norm.correctAnswer ?? "",
        correctAnswers: norm.correctAnswers ?? [],
        statements: norm.statements ?? [],
        questionType: (norm.questionType ?? "SINGLE_CHOICE") as unknown as import("@prisma/client").$Enums.QuestionType,
        explanation: norm.explanation,
        difficulty: "MEDIUM" as unknown as import("@prisma/client").$Enums.Difficulty,
        sourceKey: key,
        subjectId: 1,
      };

      const existing = await prisma.question.findFirst({ where: { sourceKey: key }, select: { id: true } });
      if (existing) { await prisma.question.update({ where: { id: existing.id }, data }); report.updated++; }
      else { await prisma.question.create({ data }); report.inserted++; }
    }
  }
  return report;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL is required"); process.exit(1); }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const report = await ingestQuestions(prisma, dryRun);
    const action = dryRun ? "dry-run" : "ingested";
    console.log(`\n✓ ${action}: files=${report.files} parsed=${report.parsed} accepted=${report.accepted} rejected=${report.rejected} inserted=${report.inserted} updated=${report.updated} skipped=${report.skipped}`);
    if (report.rejected > 0) {
      console.log(`  Rejected:`);
      for (const r of report.rejections.slice(0, 10)) console.log(`    ${r.file}[${r.index}]: ${r.issues.map((i) => i.code).join(", ")}`);
    }
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1]?.endsWith("ingest-questions.ts")) { main().catch((e) => { console.error(e); process.exit(1); }); }

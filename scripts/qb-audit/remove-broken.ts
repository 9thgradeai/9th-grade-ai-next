#!/usr/bin/env tsx
/**
 * scripts/qb-audit/remove-broken.ts
 * ----------------------------------------------------------------------------
 * Removes all broken questions from source files and BCS JSON.
 *
 * Removes questions that have:
 *   - Empty question text
 *   - Empty explanation
 *   - Empty correct answer
 *   - Answer mismatch (answer doesn't match any option)
 *   - Broken Bangla (mangled headers, option markers in wrong fields)
 *   - Non-NFC text that couldn't be normalized
 *   - Missing question (option markers in question text)
 *
 * Creates backup before any modifications.
 * Generates a detailed removal report.
 * ----------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, mkdirSync } from "fs";
import { join } from "path";
import { parseQuestionLine, OPTION_LETTERS } from "../qb-forensics/parse-flat";
import { hasMangledHeader, hasOptionMarkers } from "../qb-forensics/bangla";
import { hasReplacementChar } from "../qb-forensics/unicode";

const DATA_DIR = join(process.cwd(), "database", "data", "ques");
const BCS_JSON = join(process.cwd(), "database", "data", "question_bank", "bcs", "bcs_questions.json");
const BACKUP_DIR = join(process.cwd(), "scripts", "qb-audit", "backups");
const REPORT_DIR = join(process.cwd(), "scripts", "qb-audit", "artifacts");

// ── Normalization (same as apply-fixes.ts) ────────────────────────────────

const NON_STANDARD_SPACE = /[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2060\u00AD]/g;
const BANGLA_BASE = /[\u0980-\u09FF]/;

function normalizeText(s: string): string {
  let cur = s;
  cur = cur.replace(/^\uFEFF/, "");
  cur = cur.replace(NON_STANDARD_SPACE, " ");
  cur = cur.replace(CONTROL_CHARS, "");
  cur = cur.replace(/[ \t\r\f\v]{2,}/g, " ").trim();
  cur = cur.normalize("NFC");
  return cur.trim();
}

// ── Letter → index mapping ────────────────────────────────────────────────

const LETTER_TO_IDX: Record<string, number> = {
  ক: 0, খ: 1, গ: 2, ঘ: 3,
  a: 0, b: 1, c: 2, d: 3,
};

// ── Removal reason classification ─────────────────────────────────────────

type RemovalReason =
  | "EMPTY_QUESTION"
  | "EMPTY_ANSWER"
  | "EMPTY_EXPLANATION"
  | "EMPTY_OPTION"
  | "ANSWER_MISMATCH"
  | "BROKEN_BANGLA_HEADER"
  | "OPTION_MARKERS_IN_WRONG_FIELD"
  | "NON_NFC"
  | "REPLACEMENT_CHAR"
  | "MISSING_QUESTION";

interface RemovedQuestion {
  file: string;
  lineIndex: number;
  originalLine: string;
  reason: RemovalReason;
  detail: string;
}

// ── Check if a question is broken ─────────────────────────────────────────

function classifyQuestion(
  line: string,
  parsed: ReturnType<typeof parseQuestionLine>,
  file: string,
  lineIndex: number
): RemovedQuestion | null {
  if (!parsed) {
    return {
      file,
      lineIndex,
      originalLine: line,
      reason: "EMPTY_QUESTION",
      detail: "Could not parse as a question line",
    };
  }

  const { question, options, correctAnswer, explanation } = parsed;
  const nq = normalizeText(question);
  const ne = normalizeText(explanation);
  const na = normalizeText(correctAnswer);
  const nOpts = options.map(normalizeText);

  // Empty question
  if (!nq) {
    return { file, lineIndex, originalLine: line, reason: "EMPTY_QUESTION", detail: "Question text is empty" };
  }

  // Individual empty options
  if (nOpts.length > 0 && nOpts.some((o) => !o)) {
    return { file, lineIndex, originalLine: line, reason: "EMPTY_OPTION", detail: "One or more options are empty" };
  }

  // Empty answer
  if (!na) {
    return { file, lineIndex, originalLine: line, reason: "EMPTY_ANSWER", detail: "Correct answer is empty" };
  }

  // Answer too long (content bleed)
  if (na.length > 200) {
    return { file, lineIndex, originalLine: line, reason: "ANSWER_MISMATCH", detail: "Correct answer is unusually long (possible content bleed)" };
  }

  // Empty explanation
  if (!ne) {
    return { file, lineIndex, originalLine: line, reason: "EMPTY_EXPLANATION", detail: "Explanation is empty" };
  }

  // Broken Bangla — mangled header
  if (hasMangledHeader(nq) || hasMangledHeader(ne)) {
    return { file, lineIndex, originalLine: line, reason: "BROKEN_BANGLA_HEADER", detail: "Mangled ব্যাখ্যা header detected" };
  }

  // Option markers in wrong fields (explanation or answer)
  if (hasOptionMarkers(ne)) {
    return { file, lineIndex, originalLine: line, reason: "OPTION_MARKERS_IN_WRONG_FIELD", detail: "Option markers in explanation" };
  }

  // Replacement character
  if (hasReplacementChar(nq) || hasReplacementChar(na) || hasReplacementChar(ne) || nOpts.some(hasReplacementChar)) {
    return { file, lineIndex, originalLine: line, reason: "REPLACEMENT_CHAR", detail: "Unicode replacement character present" };
  }

  // Non-NFC (after normalization)
  if (nq !== nq.normalize("NFC") || na !== na.normalize("NFC") || ne !== ne.normalize("NFC")) {
    return { file, lineIndex, originalLine: line, reason: "NON_NFC", detail: "Text not in NFC normalization form" };
  }

  // Missing question (option markers in question text)
  if (/\((ক|খ|গ|ঘ|A|B|C|D)\)/.test(nq) || /[কখগঘA-D]\.\s/.test(nq)) {
    return { file, lineIndex, originalLine: line, reason: "MISSING_QUESTION", detail: "Option markers found in question text" };
  }

  // Answer mismatch — answer doesn't match any option
  const cleanOpts = nOpts.filter(Boolean);
  if (cleanOpts.length >= 2) {
    const ansMatches = nOpts.some((o) => o === na);
    if (!ansMatches) {
      // Check if it's a letter reference
      const letterMatch = na.match(/^\(?([কখগঘABCD])\)?[.।:\s]/i);
      if (letterMatch) {
        const idx = LETTER_TO_IDX[letterMatch[1].toLowerCase()];
        if (idx === undefined || idx >= nOpts.length || !nOpts[idx]) {
          return { file, lineIndex, originalLine: line, reason: "ANSWER_MISMATCH", detail: `Letter "${letterMatch[1]}" resolves to empty/missing option` };
        }
        // Letter resolves to a valid option — this is OK
      } else {
        return { file, lineIndex, originalLine: line, reason: "ANSWER_MISMATCH", detail: `Answer "${na.slice(0, 40)}" doesn't match any option` };
      }
    }
  }

  return null; // Question is OK
}

// ── Process source files ──────────────────────────────────────────────────

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

function backupFile(filePath: string): void {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const relPath = filePath.replace(DATA_DIR + "/", "").replace(/\//g, "__");
  copyFileSync(filePath, join(BACKUP_DIR, relPath));
}

function renumberQuestions(lines: string[]): string[] {
  let num = 1;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    // Only renumber question lines (those with উত্তর:)
    if (trimmed.includes("উত্তর:")) {
      const replaced = trimmed.replace(/^[০-৯0-9]+\.\s*/, `${num}. `);
      num++;
      return replaced;
    }
    return line;
  });
}

function processSourceFiles(): { removed: RemovedQuestion[]; totalBefore: number; totalAfter: number } {
  const files = collectTxtFiles(DATA_DIR);
  const allRemoved: RemovedQuestion[] = [];
  let totalBefore = 0;
  let totalAfter = 0;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const lines = raw.split(/\r?\n/);
    const kept: string[] = [];
    const fileRemoved: RemovedQuestion[] = [];

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) {
        kept.push(lines[i]);
        continue;
      }

      const parsed = parseQuestionLine(trimmed);
      if (!parsed) {
        kept.push(lines[i]);
        continue;
      }

      totalBefore++;
      const removal = classifyQuestion(trimmed, parsed, file, i);

      if (removal) {
        fileRemoved.push(removal);
        allRemoved.push(removal);
      } else {
        totalAfter++;
        kept.push(lines[i]);
      }
    }

    if (fileRemoved.length > 0) {
      const relPath = file.replace(DATA_DIR + "/", "");
      console.log(`  ${relPath}: removed ${fileRemoved.length} broken questions`);

      // Backup
      backupFile(file);

      // Re-number and write
      const renumbered = renumberQuestions(kept);
      writeFileSync(file, renumbered.join("\n"), "utf8");
    }
  }

  return { removed: allRemoved, totalBefore, totalAfter };
}

// ── Process BCS JSON ──────────────────────────────────────────────────────

function processBCSJson(): { removed: RemovedQuestion[]; totalBefore: number; totalAfter: number } {
  const result = { removed: [] as RemovedQuestion[], totalBefore: 0, totalAfter: 0 };

  try {
    const raw = readFileSync(BCS_JSON, "utf8");
    const data = JSON.parse(raw) as Array<{
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

    // Backup
    mkdirSync(BACKUP_DIR, { recursive: true });
    copyFileSync(BCS_JSON, join(BACKUP_DIR, "bcs_questions.json"));

    const kept: typeof data = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      result.totalBefore++;

      // Empty question
      if (!item.question || !normalizeText(item.question)) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "EMPTY_QUESTION",
          detail: "Question text is empty",
        });
        continue;
      }

  // Empty options or < 2 options
  if (!item.options || item.options.length < 2) {
    result.removed.push({
      file: "bcs_questions.json",
      lineIndex: i,
      originalLine: JSON.stringify(item).slice(0, 200),
      reason: "EMPTY_QUESTION",
      detail: `Only ${item.options?.length ?? 0} options (need at least 2)`,
    });
    continue;
  }

  // Individual empty options
  const hasEmptyOpt = item.options.some((o) => !normalizeText(o));
  if (hasEmptyOpt) {
    result.removed.push({
      file: "bcs_questions.json",
      lineIndex: i,
      originalLine: JSON.stringify(item).slice(0, 200),
      reason: "EMPTY_OPTION",
      detail: "One or more options are empty",
    });
    continue;
  }

      // Empty answer
      if (!item.correctAnswer || !normalizeText(item.correctAnswer)) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "EMPTY_ANSWER",
          detail: "Correct answer is empty",
        });
        continue;
      }

      // Empty explanation
      if (!item.explanation || !normalizeText(item.explanation)) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "EMPTY_EXPLANATION",
          detail: "Explanation is empty",
        });
        continue;
      }

      // Broken Bangla
      const q = normalizeText(item.question);
      const e = normalizeText(item.explanation);
      if (hasMangledHeader(q) || hasMangledHeader(e)) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "BROKEN_BANGLA_HEADER",
          detail: "Mangled ব্যাখ্যা header",
        });
        continue;
      }

      // Missing question (option markers in question text)
      if (/\((ক|খ|গ|ঘ|A|B|C|D)\)/.test(q) || /[কখগঘA-D]\.\s/.test(q)) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "MISSING_QUESTION",
          detail: "Option markers found in question text",
        });
        continue;
      }

      // Replacement char
      if (hasReplacementChar(q) || hasReplacementChar(e) || item.options.some(hasReplacementChar)) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "REPLACEMENT_CHAR",
          detail: "Unicode replacement character present",
        });
        continue;
      }

      // Answer mismatch
      const nOpts = item.options.map(normalizeText);
      const na = normalizeText(item.correctAnswer);
      const cleanOpts = nOpts.filter(Boolean);
      if (cleanOpts.length >= 2) {
        const ansMatches = nOpts.some((o) => o === na);
        if (!ansMatches) {
          const letterMatch = na.match(/^\(?([কখগঘABCD])\)?[.।:\s]/i);
          if (!letterMatch) {
            result.removed.push({
              file: "bcs_questions.json",
              lineIndex: i,
              originalLine: JSON.stringify(item).slice(0, 200),
              reason: "ANSWER_MISMATCH",
              detail: `Answer "${na.slice(0, 40)}" doesn't match any option`,
            });
            continue;
          }
        }
      }

      // Answer too long (content bleed)
      if (na.length > 200) {
        result.removed.push({
          file: "bcs_questions.json",
          lineIndex: i,
          originalLine: JSON.stringify(item).slice(0, 200),
          reason: "ANSWER_MISMATCH",
          detail: "Correct answer is unusually long (possible content bleed)",
        });
        continue;
      }

      result.totalAfter++;
      kept.push(item);
    }

    // Write cleaned JSON
    writeFileSync(BCS_JSON, JSON.stringify(kept, null, 2), "utf8");
    console.log(`  bcs_questions.json: removed ${result.removed.length} broken questions`);

  } catch {
    // BCS JSON not available
  }

  return result;
}

// ── Generate removal report ───────────────────────────────────────────────

function generateReport(
  srcResult: { removed: RemovedQuestion[]; totalBefore: number; totalAfter: number },
  bcsResult: { removed: RemovedQuestion[]; totalBefore: number; totalAfter: number }
): void {
  mkdirSync(REPORT_DIR, { recursive: true });

  const allRemoved = [...srcResult.removed, ...bcsResult.removed];
  const totalBefore = srcResult.totalBefore + bcsResult.totalBefore;
  const totalAfter = srcResult.totalAfter + bcsResult.totalAfter;

  // Count by reason
  const byReason: Record<string, number> = {};
  for (const r of allRemoved) {
    byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  }

  // Count by file
  const byFile: Record<string, number> = {};
  for (const r of allRemoved) {
    const f = r.file.replace(DATA_DIR + "/", "");
    byFile[f] = (byFile[f] ?? 0) + 1;
  }

  // JSON report
  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalBefore,
      totalAfter,
      totalRemoved: allRemoved.length,
      percentRemoved: Math.round(allRemoved.length * 100 / totalBefore),
    },
    removedByReason: byReason,
    removedByFile: byFile,
    removed: allRemoved.map((r) => ({
      file: r.file.replace(DATA_DIR + "/", ""),
      lineIndex: r.lineIndex,
      reason: r.reason,
      detail: r.detail,
      originalLine: r.originalLine.slice(0, 200),
    })),
  };

  writeFileSync(join(REPORT_DIR, "removal-report.json"), JSON.stringify(report, null, 2), "utf8");

  // Markdown report
  const md: string[] = [];
  md.push("# Broken Questions Removal Report");
  md.push("");
  md.push(`**Generated:** ${report.generatedAt}`);
  md.push("");
  md.push("## Summary");
  md.push("");
  md.push(`| Metric | Count |`);
  md.push(`|--------|-------|`);
  md.push(`| Questions before | ${totalBefore} |`);
  md.push(`| Questions removed | ${allRemoved.length} |`);
  md.push(`| Questions remaining | ${totalAfter} |`);
  md.push(`| Percent removed | ${report.summary.percentRemoved}% |`);
  md.push("");
  md.push("## Removed by Reason");
  md.push("");
  md.push(`| Reason | Count |`);
  md.push(`|--------|-------|`);
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${reason} | ${count} |`);
  }
  md.push("");
  md.push("## Removed by File");
  md.push("");
  md.push(`| File | Removed |`);
  md.push(`|------|---------|`);
  for (const [file, count] of Object.entries(byFile).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${file} | ${count} |`);
  }
  md.push("");
  md.push("## Backups");
  md.push("");
  md.push(`Original files backed up to: \`scripts/qb-audit/backups/\``);
  md.push("");

  writeFileSync(join(REPORT_DIR, "removal-report.md"), md.join("\n"), "utf8");

  // Console output
  console.log("\n" + "=".repeat(60));
  console.log("  REMOVAL COMPLETE");
  console.log("=".repeat(60));
  console.log(`  Questions before:  ${totalBefore}`);
  console.log(`  Questions removed: ${allRemoved.length}`);
  console.log(`  Questions after:   ${totalAfter}`);
  console.log(`  Percent removed:   ${report.summary.percentRemoved}%`);
  console.log();
  console.log("  By reason:");
  for (const [reason, count] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${reason}: ${count}`);
  }
  console.log();
  console.log("  Reports written:");
  console.log(`    ${join(REPORT_DIR, "removal-report.json")}`);
  console.log(`    ${join(REPORT_DIR, "removal-report.md")}`);
  console.log(`    Backups: ${BACKUP_DIR}/`);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main(): void {
  console.log("=".repeat(60));
  console.log("  REMOVING BROKEN QUESTIONS");
  console.log("=".repeat(60));

  console.log("\nProcessing source files...");
  const srcResult = processSourceFiles();

  console.log("\nProcessing BCS JSON...");
  const bcsResult = processBCSJson();

  generateReport(srcResult, bcsResult);
}

main();

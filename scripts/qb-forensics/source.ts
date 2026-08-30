/**
 * scripts/qb-forensics/source.ts
 * ----------------------------------------------------------------------------
 * Reads the question-bank SOURCE files under database/data/ques/ and computes
 * the same classification the DB audit uses, so source files and DB rows stay
 * byte-for-byte consistent after reseeding.
 *
 * Only HIGH-confidence, deterministic fixes are ever rewritten into the source
 * files. Mangled / review-required lines are left byte-identical.
 * ----------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { join } from "path";
import { parseQuestionLine } from "./parse-flat";
import type { QuestionRecord } from "./issues";
import { classifyRecord } from "./classify";
import { applyTransforms } from "./classify";
import { hasMangleSignature, hasMangledHeader, hasOptionMarkers } from "./bangla";
import { hasReplacementChar } from "./unicode";

export interface SourceRepair {
  /** absolute path */
  file: string;
  /** original raw line (may be null when file-level parse failed) */
  line: string;
  fixed: string | null;
  verdict: "AUTO" | "REVIEW" | "SKIP";
  reasons: string[];
  codes: string[];
  /** line index within the file (0-based) */
  lineIndex: number;
}

export interface SourcePlan {
  repairs: SourceRepair[];
  files: string[];
}

const DATA_DIR = join(process.cwd(), "database", "data", "ques");

function collectFiles(dir: string): string[] {
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

function numberPrefix(line: string): string {
  const m = line.match(/^\s*([০-৯0-9]+)\s*\./);
  return m ? m[1] : "";
}

/** Raw-text corruption signature check (mirrors classify.fieldMangled). */
function fieldMangledRaw(line: string): boolean {
  return hasMangleSignature(line) || hasMangledHeader(line) || hasReplacementChar(line) || hasOptionMarkers(line);
}

export function toRecord(id: number, parsed: { question: string; options: string[]; correctAnswer: string; explanation: string }): QuestionRecord {
  return {
    id,
    subjectId: -1,
    topic: "",
    subtopic: "",
    path: "",
    question: parsed.question,
    options: parsed.options,
    correctAnswer: parsed.correctAnswer,
    explanation: parsed.explanation,
  };
}

/** Classify one raw source line and produce the repaired line (or null when untouched). */
export function repairLine(line: string, id: number): { fixed: string | null; verdict: string; reasons: string[]; codes: string[]; parsed: ReturnType<typeof parseQuestionLine> } {
  const num = numberPrefix(line);
  // Check the RAW line (not just the strict parse) so a misspelled ব্যাখ্যা
  // header or visual-order corruption that the parser absorbs is still sent
  // to REVIEW — matching the DB classifier.
  const rawMangled = fieldMangledRaw(line);
  const parsed = parseQuestionLine(line);
  if (!parsed) {
    return { fixed: null, verdict: "SKIP", reasons: ["not parseable as a question line"], codes: [], parsed: null };
  }
  const cls = classifyRecord(toRecord(id, parsed));
  if (rawMangled || cls.verdict === "REVIEW") {
    const reasons = rawMangled ? ["raw line: visual-order / mis-parse corruption", ...cls.reviewReasons] : cls.reviewReasons;
    return { fixed: null, verdict: "REVIEW", reasons, codes: [], parsed };
  }

  // Deterministic per-field normalization (HIGH).
  const q = applyTransforms(parsed.question).value;
  const ops = parsed.options.map((o) => applyTransforms(o).value);
  const ans = applyTransforms(parsed.correctAnswer).value;
  const exp = applyTransforms(parsed.explanation).value;

  let fixed: string | null = null;
  if (q !== parsed.question || ops.some((o, i) => o !== parsed.options[i]) || ans !== parsed.correctAnswer || exp !== parsed.explanation) {
    fixed = serializeFix(num, q, ops, ans, exp);
  }
  const codes: string[] = [];
  if (q !== parsed.question) codes.push("question");
  if (ops.some((o, i) => o !== parsed.options[i])) codes.push("options");
  if (ans !== parsed.correctAnswer) codes.push("correctAnswer");
  if (exp !== parsed.explanation) codes.push("explanation");
  return { fixed, verdict: "AUTO", reasons: [], codes, parsed };
}

function serializeFix(num: string, question: string, options: string[], correctAnswer: string, explanation: string): string {
  const idx = options.findIndex((o) => o === correctAnswer);
  const letter = idx >= 0 ? `${["ক", "খ", "গ", "ঘ"][idx]}. ` : "";
  const parts: string[] = [];
  if (num) parts.push(`${num}.`);
  parts.push(question.trim());
  for (let i = 0; i < 4; i++) parts.push(`${["ক", "খ", "গ", "ঘ"][i]}. ${options[i] ?? ""}`);
  parts.push(`উত্তর: ${letter}${correctAnswer}`);
  parts.push(`ব্যাখ্যা: ${explanation}`);
  return parts.join(" ");
}

/**
 * Enumerate the "question lines" of a raw file in document order, skipping
 * blank lines and subject header lines exactly as the seeder does. Shared by
 * BOTH buildSourcePlan (to build repairs) and applySourcePlan (to pair them),
 * guaranteeing identical segmentation so line indices always align.
 */
function questionLineIndexes(raw: string): number[] {
  const rawLines = raw.split(/\r?\n/);
  const idx: number[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    const isHeaderOrBlank =
      !t || (!t.includes("উত্তর:") && /^[০-৯0-9]+\.\s+/.test(t) && !t.includes("ক."));
    if (!isHeaderOrBlank) idx.push(i);
  }
  return idx;
}

export function buildSourcePlan(): SourcePlan {
  const files = collectFiles(DATA_DIR);
  const repairs: SourceRepair[] = [];
  let id = 0;

  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    let idx = 0;
    for (const lineIndex of questionLineIndexes(raw)) {
      const rawLines = raw.split(/\r?\n/);
      const line = rawLines[lineIndex].trim();
      const r = repairLine(line, id++);
      repairs.push({
        file,
        line,
        fixed: r.fixed,
        verdict: r.verdict as "AUTO" | "REVIEW" | "SKIP",
        reasons: r.reasons,
        codes: r.codes,
        lineIndex: idx,
      });
      idx++;
    }
  }
  return { repairs, files };
}

/** Rewrite the source files in place (only AUTO repairs; REVIEW/SKIP lines are byte-identical). */
export function applySourcePlan(plan: SourcePlan, dryRun = false): { writtenFiles: number; fixedLines: number } {
  const writtenFiles = new Set<string>();
  let fixedLines = 0;

  for (const file of plan.files) {
    const repairs = plan.repairs.filter((r) => r.file === file);
    if (repairs.length === 0) continue;
    const raw = readFileSync(file, "utf8");
    // Split on "\n" keeping any trailing "\r" attached to each line, so every
    // original line terminator (incl. mixed CRLF/LF) is preserved exactly.
    const rawLines = raw.split("\n");
    const terminatesWithNl = rawLines[rawLines.length - 1] === "";
    if (terminatesWithNl) rawLines.pop();
    const qIdx = questionLineIndexes(rawLines.join("\n"));
    const out = rawLines.slice();
    if (qIdx.length !== repairs.length) {
      throw new Error(
        `source plan misaligned for ${file}: ${qIdx.length} question lines vs ${repairs.length} repairs`,
      );
    }
    for (let k = 0; k < qIdx.length; k++) {
      const rep = repairs[k];
      if (rep.fixed && rep.verdict === "AUTO") {
        const orig = rawLines[qIdx[k]];
        const hadCr = orig.endsWith("\r");
        out[qIdx[k]] = rep.fixed + (hadCr ? "\r" : "");
        fixedLines++;
      }
    }
    const rebuilt = out.join("\n") + (terminatesWithNl ? "\n" : "");
    if (rebuilt !== raw) {
      writtenFiles.add(file);
      if (!dryRun) {
        writeFileSync(file, rebuilt, "utf8");
      }
    }
  }
  return { writtenFiles: writtenFiles.size, fixedLines };
}

export function sourceFilePath(): string {
  return DATA_DIR;
}

export function hasSourceFileAt(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
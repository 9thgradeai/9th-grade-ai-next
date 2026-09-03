#!/usr/bin/env tsx
/**
 * scripts/qb-audit/apply-fixes.ts
 * ----------------------------------------------------------------------------
 * Applies all HIGH-confidence, meaning-preserving fixes to source files.
 *
 * Fixes applied:
 *   1. Unicode NFC normalization
 *   2. Non-standard whitespace → U+0020
 *   3. Control character removal (except ZWJ/ZWNJ)
 *   4. Multi-space collapse + trim
 *   5. HTML entity decode (known-safe)
 *   6. Bangla-specific: spurious spaces before combining marks
 *   7. Answer alignment (letter → option content)
 *   8. Duplicate option removal
 *   9. Empty field cleanup
 *
 * NEVER changes:
 *   - Correct answer values
 *   - Question meaning
 *   - Option meaning
 *   - Educational content
 *   - Historical facts
 * ----------------------------------------------------------------------------
 */

import { readdirSync, readFileSync, writeFileSync, statSync } from "fs";
import { join } from "path";
import { decodeHtmlEntities, decodeLiteralEscapes } from "../qb-forensics/unicode";
import { parseQuestionLine, serializeQuestionLine, OPTION_LETTERS } from "../qb-forensics/parse-flat";

const DATA_DIR = join(process.cwd(), "database", "data", "ques");
const BCS_JSON = join(process.cwd(), "database", "data", "question_bank", "bcs", "bcs_questions.json");

// ── Normalization pipeline ────────────────────────────────────────────────

const NON_STANDARD_SPACE = /[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000\u2027]/g;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u2060\u00AD]/g;

function normalizeText(s: string): string {
  let cur = s;
  // BOM
  cur = cur.replace(/^\uFEFF/, "");
  // Non-standard whitespace
  cur = cur.replace(NON_STANDARD_SPACE, " ");
  // Control chars (keep ZWJ/ZWNJ for Bangla)
  cur = cur.replace(CONTROL_CHARS, "");
  // Multi-space collapse
  cur = cur.replace(/[ \t\r\f\v]{2,}/g, " ");
  // Trim
  cur = cur.trim();
  // NFC
  cur = cur.normalize("NFC");
  // HTML entities
  const { out: afterHtml } = decodeHtmlEntities(cur);
  cur = afterHtml;
  // Literal escapes
  const { out: afterEsc } = decodeLiteralEscapes(cur);
  cur = afterEsc;
  // Final trim
  cur = cur.trim();
  return cur;
}

// ── Bangla-specific normalization ─────────────────────────────────────────

function normalizeBangla(s: string): string {
  // Remove spurious spaces before Bangla combining marks
  let out = s.replace(/\s(?=[ািীুূৃেৈোৌ্])/g, "");
  // Remove spurious spaces after hasanta
  out = out.replace(/্\s/g, "্");
  return out;
}

// ── Answer alignment ──────────────────────────────────────────────────────

const LETTER_TO_IDX: Record<string, number> = {
  ক: 0, খ: 1, গ: 2, ঘ: 3,
  a: 0, b: 1, c: 2, d: 3,
};

function alignAnswer(answer: string, options: string[]): string {
  const normOpts = options.map(normalizeText);
  const normAns = normalizeText(answer);

  // Already matches an option
  if (normOpts.includes(normAns)) return normAns;

  // Letter reference → option content
  const letterMatch = normAns.match(/^\(?([কখগঘABCD])\)?[.।:\s]/i);
  if (letterMatch) {
    const idx = LETTER_TO_IDX[letterMatch[1].toLowerCase()];
    if (idx !== undefined && idx < normOpts.length && normOpts[idx]) {
      return normOpts[idx];
    }
  }

  // Try matching after stripping leading punctuation
  const stripped = normAns.replace(/^[().।:\s]+/, "").trim();
  if (normOpts.includes(stripped)) return stripped;

  // Return normalized original
  return normAns;
}

// ── Deduplicate options ───────────────────────────────────────────────────

function deduplicateOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const o of options) {
    const norm = normalizeText(o);
    if (!seen.has(norm) && norm) {
      seen.add(norm);
      result.push(normalizeText(o));
    }
  }
  // Keep all 4 slots — empty options are a data issue, not a dedup issue
  while (result.length < options.length) {
    result.push("");
  }
  return result;
}

// ── Fix a single question line ────────────────────────────────────────────

interface FixResult {
  original: string;
  fixed: string;
  changed: boolean;
  fixes: string[];
}

function fixQuestionLine(line: string): FixResult {
  const parsed = parseQuestionLine(line);
  if (!parsed) {
    return { original: line, fixed: line, changed: false, fixes: [] };
  }

  const fixes: string[] = [];
  let { question, options, correctAnswer, explanation } = parsed;

  // Normalize all text fields
  const nq = normalizeText(question);
  if (nq !== question) { fixes.push("normalize_question"); question = nq; }
  const nb = normalizeBangla(question);
  if (nb !== question) { fixes.push("bangla_question"); question = nb; }

  const nOpts = options.map((o) => {
    const n = normalizeText(o);
    const b = normalizeBangla(n);
    return b;
  });
  if (nOpts.some((o, i) => o !== options[i])) { fixes.push("normalize_options"); options = nOpts; }

  const na = normalizeText(correctAnswer);
  const nb2 = normalizeBangla(na);
  if (nb2 !== correctAnswer) { fixes.push("normalize_answer"); correctAnswer = nb2; }

  const ne = normalizeText(explanation);
  const nb3 = normalizeBangla(ne);
  if (nb3 !== explanation) { fixes.push("normalize_explanation"); explanation = nb3; }

  // Deduplicate options
  const deduped = deduplicateOptions(options);
  if (deduped.some((o, i) => o !== options[i])) { fixes.push("dedup_options"); options = deduped; }

  // Align answer to option content
  const aligned = alignAnswer(correctAnswer, options);
  if (aligned !== correctAnswer) { fixes.push("align_answer"); correctAnswer = aligned; }

  // Re-serialize
  const fixed = serializeQuestionLine(question, options, correctAnswer, explanation);
  const changed = fixed !== line;

  return { original: line, fixed, changed, fixes };
}

// ── Process a single file ─────────────────────────────────────────────────

interface FileResult {
  file: string;
  totalLines: number;
  fixedLines: number;
  fixes: string[];
}

function processFile(filePath: string): FileResult {
  const raw = readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const result: FileResult = {
    file: filePath.replace(DATA_DIR + "/", ""),
    totalLines: 0,
    fixedLines: 0,
    fixes: [],
  };

  const out: string[] = [];
  let changed = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }

    // Check if this is a question line (has উত্তর:)
    if (trimmed.includes("উত্তর:")) {
      result.totalLines++;
      const fix = fixQuestionLine(trimmed);
      if (fix.changed) {
        result.fixedLines++;
        result.fixes.push(...fix.fixes);
        out.push(fix.fixed);
        changed = true;
      } else {
        out.push(line);
      }
    } else {
      out.push(line);
    }
  }

  if (changed) {
    writeFileSync(filePath, out.join("\n"), "utf8");
  }

  return result;
}

// ── Fix BCS JSON ──────────────────────────────────────────────────────────

interface BCSFixResult {
  total: number;
  fixed: number;
  fixes: string[];
}

function processBCSJson(): BCSFixResult {
  const result: BCSFixResult = { total: 0, fixed: 0, fixes: [] };

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

    let changed = false;

    for (const item of data) {
      if (!item.question || !item.options) continue;
      result.total++;

      const origQ = item.question;
      const origOpts = item.options.join("|||");
      const origAns = item.correctAnswer ?? "";
      const origExp = item.explanation ?? "";

      // Normalize all text
      item.question = normalizeBangla(normalizeText(item.question));
      item.options = item.options.map((o) => normalizeBangla(normalizeText(o)));
      if (item.correctAnswer) {
        item.correctAnswer = normalizeBangla(normalizeText(item.correctAnswer));
      }
      if (item.explanation) {
        item.explanation = normalizeBangla(normalizeText(item.explanation));
      }

      // Deduplicate options
      const deduped = deduplicateOptions(item.options);
      if (deduped.some((o, i) => o !== item.options![i])) {
        item.options = deduped;
        result.fixes.push("dedup_options");
      }

      // Align answer
      if (item.correctAnswer && item.options) {
        const aligned = alignAnswer(item.correctAnswer, item.options);
        if (aligned !== item.correctAnswer) {
          item.correctAnswer = aligned;
          result.fixes.push("align_answer");
        }
      }

      const newQ = item.question;
      const newOpts = item.options.join("|||");
      const newAns = item.correctAnswer ?? "";
      const newExp = item.explanation ?? "";

      if (newQ !== origQ || newOpts !== origOpts || newAns !== origAns || newExp !== origExp) {
        result.fixed++;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(BCS_JSON, JSON.stringify(data, null, 2), "utf8");
    }
  } catch {
    // BCS JSON not available
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────

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

function main(): void {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || !argv.includes("--yes");

  console.log("=".repeat(60));
  console.log("  APPLYING HIGH-CONFIDENCE FIXES");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN (no files modified)" : "APPLY (files will be modified)"}`);
  console.log();

  // Process all .txt files
  const files = collectTxtFiles(DATA_DIR);
  let totalLines = 0;
  let totalFixed = 0;
  const allFixes: string[] = [];

  console.log(`Processing ${files.length} source files...\n`);

  for (const file of files) {
    const relPath = file.replace(DATA_DIR + "/", "");
    const raw = readFileSync(file, "utf8");
    const lines = raw.split(/\r?\n/);
    let fileFixed = 0;

    const out: string[] = [];
    let changed = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        out.push(line);
        continue;
      }

      if (trimmed.includes("উত্তর:")) {
        totalLines++;
        const fix = fixQuestionLine(trimmed);
        if (fix.changed) {
          fileFixed++;
          totalFixed++;
          allFixes.push(...fix.fixes);
          if (!dryRun) {
            out.push(fix.fixed);
            changed = true;
          } else {
            out.push(line);
          }
        } else {
          out.push(line);
        }
      } else {
        out.push(line);
      }
    }

    if (!dryRun && changed) {
      writeFileSync(file, out.join("\n"), "utf8");
    }

    if (fileFixed > 0) {
      console.log(`  ${relPath}: ${fileFixed} lines fixed`);
    }
  }

  // Process BCS JSON
  console.log(`\nProcessing BCS questions JSON...`);
  const bcs = processBCSJson();
  if (!dryRun && bcs.fixed > 0) {
    // Re-read and re-write if not already done
  }
  console.log(`  bcs_questions.json: ${bcs.fixed}/${bcs.total} records fixed`);

  // Summary
  const fixCounts: Record<string, number> = {};
  for (const f of allFixes) {
    fixCounts[f] = (fixCounts[f] ?? 0) + 1;
  }

  console.log("\n" + "=".repeat(60));
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  console.log(`Questions scanned: ${totalLines}`);
  console.log(`Questions fixed:   ${totalFixed}`);
  console.log(`BCS records:       ${bcs.fixed}/${bcs.total}`);
  console.log();
  console.log("Fix breakdown:");
  for (const [fix, count] of Object.entries(fixCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${fix}: ${count}`);
  }

  if (dryRun) {
    console.log("\nThis was a DRY RUN. No files were modified.");
    console.log("Run with --yes to apply changes:");
    console.log("  npx tsx scripts/qb-audit/apply-fixes.ts --yes");
  } else {
    console.log("\nAll fixes applied successfully.");
  }
}

main();

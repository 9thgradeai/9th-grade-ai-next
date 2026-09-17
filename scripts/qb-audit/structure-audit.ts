/**
 * scripts/qb-audit/structure-audit.ts
 * ----------------------------------------------------------------------------
 * Phase 5: Structure + option + answer + explanation audit.
 * Validates that every question has the correct logical structure.
 * ----------------------------------------------------------------------------
 */

import type { QuestionRecord, StructureIssue } from "./types";

const BANGLA_LETTERS = ["ক", "খ", "গ", "ঘ"];
const LATIN_LETTERS = ["A", "B", "C", "D"];

function stripNormalized(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u00A0\u1680\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[ \t\r\f\v]{2,}/g, " ")
    .trim();
}

export function auditStructure(records: QuestionRecord[]): StructureIssue[] {
  const issues: StructureIssue[] = [];

  for (const r of records) {
    const q = stripNormalized(r.question);
    const opts = r.options.map(stripNormalized);
    const ans = stripNormalized(r.correctAnswer);
    const exp = stripNormalized(r.explanation);

    // ── Question text ────────────────────────────────────────────────────
    if (!q) {
      issues.push({
        type: "EMPTY_QUESTION",
        recordId: r.id,
        detail: "Question text is empty after normalization",
        confidence: "HIGH",
      });
    }

    // ── Options ──────────────────────────────────────────────────────────
    if (opts.length === 0) {
      issues.push({
        type: "MISSING_OPTIONS",
        recordId: r.id,
        detail: "No options found",
        confidence: "HIGH",
      });
    } else if (opts.length !== 4) {
      issues.push({
        type: "WRONG_OPTION_COUNT",
        recordId: r.id,
        detail: `Expected 4 options, found ${opts.length}`,
        confidence: "MEDIUM",
      });
    }

    // Empty options
    for (let i = 0; i < opts.length; i++) {
      if (!opts[i]) {
        issues.push({
          type: "EMPTY_OPTION",
          recordId: r.id,
          detail: `Option ${BANGLA_LETTERS[i] ?? LATIN_LETTERS[i] ?? i} is empty`,
          confidence: "HIGH",
        });
      }
    }

    // Duplicate options
    const uniqueOpts = new Set(opts.filter(Boolean));
    if (uniqueOpts.size < opts.filter(Boolean).length) {
      issues.push({
        type: "DUPLICATE_OPTIONS",
        recordId: r.id,
        detail: `Duplicate options detected: ${opts.filter(Boolean).length} non-empty but ${uniqueOpts.size} unique`,
        confidence: "HIGH",
      });
    }

    // ── Correct answer ───────────────────────────────────────────────────
    if (!ans) {
      issues.push({
        type: "EMPTY_ANSWER",
        recordId: r.id,
        detail: "Correct answer is empty",
        confidence: "HIGH",
      });
    } else if (opts.length === 4 && uniqueOpts.size === 4) {
      // Check if answer matches any option
      const ansMatches = opts.some((o) => o === ans);
      if (!ansMatches) {
        // Check if it's a letter reference
        const letterRef = ans.match(/^\(?([কখগঘABCD])\)?[.।:]/i);
        if (!letterRef) {
          issues.push({
            type: "ANSWER_MISMATCH",
            recordId: r.id,
            detail: `Correct answer "${ans.slice(0, 40)}" does not match any option`,
            confidence: "MEDIUM",
          });
        }
      }
    }

    // ── Explanation ──────────────────────────────────────────────────────
    if (!exp) {
      issues.push({
        type: "EMPTY_EXPLANATION",
        recordId: r.id,
        detail: "Explanation is empty",
        confidence: "LOW",
      });
    }

    // ── Content integrity checks ─────────────────────────────────────────
    // Question contains option markers (likely parsing error)
    if (/\((ক|খ|গ|ঘ|A|B|C|D)\)/.test(q) || /[কখগঘA-D]\.\s/.test(q)) {
      issues.push({
        type: "MISSING_QUESTION",
        recordId: r.id,
        detail: "Question text appears to contain option markers (possible parsing error)",
        confidence: "MEDIUM",
      });
    }

    // Answer contains explanation text
    if (ans.length > 200) {
      issues.push({
        type: "ANSWER_MISMATCH",
        recordId: r.id,
        detail: "Correct answer is unusually long (possible content bleed)",
        confidence: "MEDIUM",
      });
    }

    // Question is extremely short
    if (q && q.length < 5) {
      issues.push({
        type: "EMPTY_QUESTION",
        recordId: r.id,
        detail: `Question text is very short (${q.length} chars): "${q}"`,
        confidence: "LOW",
      });
    }
  }

  return issues;
}

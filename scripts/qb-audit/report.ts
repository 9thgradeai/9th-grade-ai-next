/**
 * scripts/qb-audit/report.ts
 * ----------------------------------------------------------------------------
 * Phase 8 + 17: Report generation.
 * Produces JSON, CSV, Markdown, and manual-review artifacts.
 * ----------------------------------------------------------------------------
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type {
  AuditReport,
  ClassificationResult,
  UnicodeIssue,
  StructureIssue,
  DuplicateGroup,
  OCRIncident,
  ChangeLog,
} from "./types";

const REPORT_DIR = join(process.cwd(), "scripts", "qb-audit", "artifacts");

function ensureDir(): void {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function writeJson(name: string, data: unknown): string {
  ensureDir();
  const p = join(REPORT_DIR, name);
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  return p;
}

function writeCsv(name: string, headers: string[], rows: string[][]): string {
  ensureDir();
  const p = join(REPORT_DIR, name);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ];
  writeFileSync(p, lines.join("\n"), "utf8");
  return p;
}

export function generateAllReports(report: AuditReport): string[] {
  const paths: string[] = [];

  // ── Main JSON report ──────────────────────────────────────────────────
  paths.push(writeJson("question-quality-report.json", report));

  // ── Unicode issues ────────────────────────────────────────────────────
  paths.push(writeJson("unicode-issues.json", report.unicodeIssues));

  // ── Structure issues ──────────────────────────────────────────────────
  paths.push(writeJson("structure-issues.json", report.structureIssues));

  // ── Duplicate report ──────────────────────────────────────────────────
  paths.push(writeJson("question-duplicate-report.json", report.duplicateGroups));

  // ── OCR incidents ─────────────────────────────────────────────────────
  paths.push(writeJson("ocr-incidents.json", report.ocrIncidents));

  // ── Manual review queue ───────────────────────────────────────────────
  const manualReview = report.classifications
    .filter((c) => c.verdict === "REVIEW")
    .map((c) => ({
      questionId: c.record.id,
      subject: c.record.subjectName,
      topic: c.record.topic,
      bcsTerm: c.record.bcsTerm,
      issues: c.issues.map((i) => ({
        field: i.field,
        code: i.code,
        severity: i.severity,
        detail: i.detail,
        confidence: i.confidence,
      })),
      reviewReasons: c.reviewReasons,
      qualityScore: c.qualityScore,
      qualityGrade: c.qualityGrade,
    }));
  paths.push(writeJson("question-manual-review.json", manualReview));

  // ── Changes log ───────────────────────────────────────────────────────
  const changes: ChangeLog[] = [];
  for (const c of report.classifications) {
    for (const fix of c.fixes) {
      changes.push({
        questionId: c.record.id,
        source: c.record.source,
        field: fix.field,
        before: fix.before,
        after: fix.after,
        issueType: fix.codes.join("+"),
        confidence: fix.confidence,
        reason: `Deterministic normalization: ${fix.codes.join(", ")}`,
        timestamp: new Date().toISOString(),
        migrationVersion: "1.0.0",
      });
    }
  }
  paths.push(writeJson("question-changes.json", changes));

  // ── CSV summary ───────────────────────────────────────────────────────
  const csvHeaders = [
    "ID", "Source", "Subject", "Question (truncated)",
    "Quality Score", "Grade", "Verdict", "Issues", "Fixes",
  ];
  const csvRows = report.classifications.map((c) => [
    String(c.record.id),
    c.record.source,
    c.record.subjectName ?? "",
    c.record.question.slice(0, 80),
    String(c.qualityScore),
    c.qualityGrade,
    c.verdict,
    String(c.issues.length),
    String(c.fixes.length),
  ]);
  paths.push(writeCsv("question-quality-report.csv", csvHeaders, csvRows));

  // ── Markdown report ───────────────────────────────────────────────────
  paths.push(writeJson("qb-audit-report.md", generateMarkdown(report)));

  return paths;
}

function generateMarkdown(report: AuditReport): string {
  const lines: string[] = [];

  lines.push("# Question Bank Quality Audit Report");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Scope:** ${report.scope}`);
  lines.push("");

  // ── Inventory ──────────────────────────────────────────────────────────
  lines.push("## Database Inventory");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total Questions | ${report.inventory.totalQuestions} |`);
  lines.push(`| Total Options | ${report.inventory.totalOptions} |`);
  lines.push(`| Total Explanations | ${report.inventory.totalExplanations} |`);
  lines.push(`| Total Subjects | ${report.inventory.totalSubjects} |`);
  lines.push(`| Source Files | ${report.inventory.sourceFiles} |`);
  lines.push(`| DB Records | ${report.inventory.dbRecords} |`);
  lines.push("");

  // ── Totals ─────────────────────────────────────────────────────────────
  lines.push("## Audit Summary");
  lines.push("");
  lines.push(`| Category | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Scanned | ${report.totals.scanned} |`);
  lines.push(`| Clean | ${report.totals.clean} |`);
  lines.push(`| Auto-fixable | ${report.totals.autoFixable} |`);
  lines.push(`| Review required | ${report.totals.reviewRequired} |`);
  lines.push(`| Critical | ${report.totals.critical} |`);
  lines.push("");

  // ── Quality distribution ───────────────────────────────────────────────
  lines.push("## Quality Distribution");
  lines.push("");
  lines.push(`| Grade | Count |`);
  lines.push(`|-------|-------|`);
  for (const [grade, count] of Object.entries(report.qualityDistribution).sort()) {
    lines.push(`| ${grade} | ${count} |`);
  }
  lines.push("");

  // ── Issues ─────────────────────────────────────────────────────────────
  lines.push("## Issue Summary");
  lines.push("");
  lines.push(`| Issue Type | Count |`);
  lines.push(`|------------|-------|`);
  lines.push(`| Unicode issues | ${report.unicodeIssues.length} |`);
  lines.push(`| Structure issues | ${report.structureIssues.length} |`);
  lines.push(`| Duplicate groups | ${report.duplicateGroups.length} |`);
  lines.push(`| OCR incidents | ${report.ocrIncidents.length} |`);
  lines.push("");

  // ── Per-subject breakdown ──────────────────────────────────────────────
  lines.push("## Per-Subject Breakdown");
  lines.push("");
  lines.push(`| Subject | Questions |`);
  lines.push(`|---------|-----------|`);
  for (const [subject, count] of Object.entries(report.inventory.questionsPerSubject).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${subject} | ${count} |`);
  }
  lines.push("");

  // ── Manual review queue ────────────────────────────────────────────────
  const reviewItems = report.classifications.filter((c) => c.verdict === "REVIEW");
  if (reviewItems.length > 0) {
    lines.push("## Manual Review Required");
    lines.push("");
    lines.push(`${reviewItems.length} questions require manual review.`);
    lines.push("");
    lines.push("Top 20 items:");
    lines.push("");
    for (const item of reviewItems.slice(0, 20)) {
      lines.push(`- **#${item.record.id}** (${item.record.subjectName ?? "unknown"}): ${item.reviewReasons.join("; ")}`);
    }
    lines.push("");
  }

  // ── Transformation pipeline ────────────────────────────────────────────
  lines.push("## Normalization Pipeline");
  lines.push("");
  lines.push("Every AUTO fix applies these transforms in order:");
  lines.push("1. BOM strip");
  lines.push("2. Non-standard whitespace → U+0020");
  lines.push("3. Control character removal (except ZWJ/ZWNJ)");
  lines.push("4. Multi-space collapse + trim");
  lines.push("5. Unicode NFC normalization");
  lines.push("6. HTML entity decode (known-safe only)");
  lines.push("7. Literal escape decode (\\\\n, \\\\t)");
  lines.push("8. Bangla-specific normalization");
  lines.push("9. English-specific normalization");
  lines.push("");
  lines.push("Review rows are NEVER touched by automatic fixes.");
  lines.push("");

  return lines.join("\n");
}

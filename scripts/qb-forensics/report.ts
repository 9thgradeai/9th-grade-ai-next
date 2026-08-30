/**
 * scripts/qb-forensics/report.ts
 * ----------------------------------------------------------------------------
 * Emits the four canonical artifacts plus a Markdown summary:
 *   - audit-report.json
 *   - repair-plan.json
 *   - review-required.json
 *   - migration-summary.json
 *   - qb-forensics-report.md
 * ----------------------------------------------------------------------------
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import type { AuditReport, ClassifiedRecord, QuestionRecord } from "./issues";

export interface RepairPlanRecord extends QuestionRecord {
  verdict: "AUTO" | "REVIEW";
  fixes: Array<{ field: string; code: string; from: string; to: string; confidence: string }>;
  reviewReasons: string[];
  candidates: Array<{ field: string; code: string; from: string; candidate: string; confidence: string; rationale: string }>;
}

export function artifactDir(name: string): string {
  const dir = join(process.cwd(), "scripts", "qb-forensics", "artifacts");
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

export function writeJson(name: string, data: unknown): string {
  const p = artifactDir(name);
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  return p;
}

export function buildRepairPlan(records: ClassifiedRecord[]): RepairPlanRecord[] {
  return records.map((r) => ({
    id: r.id,
    subjectId: r.subjectId,
    topic: r.topic,
    subtopic: r.subtopic,
    path: r.path,
    question: r.question,
    options: r.options,
    correctAnswer: r.correctAnswer,
    explanation: r.explanation,
    verdict: r.verdict,
    fixes: r.fixes,
    reviewReasons: r.reviewReasons,
    candidates: r.candidates,
  }));
}

export function writeReports(records: ClassifiedRecord[], report: AuditReport): { paths: string[] } {
  const repairPlan = buildRepairPlan(records);
  const review = repairPlan.filter((r) => r.verdict === "REVIEW" || r.reviewReasons.length > 0);
  const paths = [
    writeJson("audit-report.json", report),
    writeJson("repair-plan.json", repairPlan),
    writeJson("review-required.json", review),
  ];
  return { paths };
}

export function writeMarkdown(report: AuditReport, records: ClassifiedRecord[]): string {
  const mdLines: string[] = [];
  mdLines.push("# Question-Bank Forensic Audit Report");
  mdLines.push("");
  mdLines.push(`Generated: ${report.generatedAt} · Scope: ${report.scope}`);
  mdLines.push("");
  mdLines.push("## Totals");
  mdLines.push("");
  mdLines.push(`- Scanned: **${report.totals.scanned}**`);
  mdLines.push(`- Clean: **${report.totals.clean}**`);
  mdLines.push(`- Auto-fixable (deterministic): **${report.totals.autoFixeable}**`);
  mdLines.push(`- Review required (mangled / ambiguous): **${report.totals.reviewRequired}**`);
  mdLines.push("");
  mdLines.push("## Per-subject");
  mdLines.push("");
  mdLines.push("| Subject | Scanned | Clean | Auto | Review |");
  mdLines.push("|---------|---------|-------|------|--------|");
  for (const [subj, s] of Object.entries(report.perSubject)) {
    mdLines.push(`| ${subj} | ${s.scanned} | ${s.clean} | ${s.fixed} | ${s.review} |`);
  }
  mdLines.push("");
  mdLines.push("## Issue counts");
  mdLines.push("");
  mdLines.push("| Code | Count |");
  mdLines.push("|------|-------|");
  for (const [code, count] of Object.entries(report.issueCounts).sort((a, b) => b[1] - a[1])) {
    mdLines.push(`| ${code} | ${count} |`);
  }
  mdLines.push("");
  mdLines.push("## Confidence");
  mdLines.push("");
  mdLines.push(`- HIGH: ${report.confidenceCounts.HIGH} · MEDIUM: ${report.confidenceCounts.MEDIUM} · LOW: ${report.confidenceCounts.LOW}`);
  mdLines.push("");
  mdLines.push("## Deterministic transformation order");
  mdLines.push("");
  mdLines.push("Every AUTO fix is the compose of, in order: BOM strip → non-standard whitespace → multi-space/trim → NFC → literal HTML-entity / `\\n` escape decode. Review rows are NOT touched.");
  mdLines.push("");

  const autoCount = records.filter((r) => r.verdict === "AUTO" && r.fixes.length > 0).length;
  void autoCount;

  return mdLines.join("\n");
}

export function writeMigrationSummary(result: unknown): string {
  return writeJson("migration-summary.json", result);
}
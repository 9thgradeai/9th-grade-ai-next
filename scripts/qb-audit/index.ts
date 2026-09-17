#!/usr/bin/env tsx
/**
 * scripts/qb-audit/index.ts
 * ----------------------------------------------------------------------------
 * Comprehensive question-bank audit & normalization CLI.
 *
 * Usage:
 *   npx tsx scripts/qb-audit/index.ts audit          # Full read-only audit
 *   npx tsx scripts/qb-audit/index.ts normalize       # Dry-run normalization
 *   npx tsx scripts/qb-audit/index.ts normalize:apply # Apply HIGH-confidence fixes
 *   npx tsx scripts/qb-audit/index.ts validate        # Post-normalization validation
 *   npx tsx scripts/qb-audit/index.ts report          # Generate reports only
 *
 * All commands default to DRY RUN. Use --yes to confirm writes.
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { scanSourceFiles } from "./inventory";
import { auditUnicode } from "./unicode-audit";
import { auditBangla } from "./bangla-audit";
import { auditStructure } from "./structure-audit";
import { detectOCR } from "./ocr-detect";
import { detectDuplicates } from "./duplicate-detect";
import { calculateQualityScore } from "./quality-score";
import { normalizeRecord } from "./normalize";
import { generateAllReports } from "./report";
import type {
  AuditReport,
  ClassificationResult,
  QuestionRecord,
  UnicodeIssue,
  StructureIssue,
  DuplicateGroup,
  OCRIncident,
} from "./types";

function usage(): void {
  console.log(`
qb-audit — comprehensive question-bank quality audit & normalization

Commands:
  audit            Full read-only audit (Unicode + structure + OCR + duplicates + quality)
  normalize        Dry-run normalization (shows what would change)
  normalize:apply  Apply HIGH-confidence fixes (requires --yes)
  validate         Post-normalization validation (re-run audit)
  report           Generate reports only (from last audit)

Flags:
  --yes            Confirm writes (required for normalize:apply)
  --verbose        Show detailed output
  --subject N      Filter to specific subject ID
`.trim());
}

interface AuditResult {
  report: AuditReport;
  unicodeIssues: UnicodeIssue[];
  structureIssues: StructureIssue[];
  duplicateGroups: DuplicateGroup[];
  ocrIncidents: OCRIncident[];
  classifications: ClassificationResult[];
}

function runFullAudit(records: QuestionRecord[], verbose = false): AuditResult {
  const total = records.length;
  console.log(`\nScanning ${total} questions...\n`);

  // Phase 3-4: Unicode + Bangla audit
  console.log("Phase 3-4: Unicode & Bangla audit...");
  const unicodeIssues = auditUnicode(records);
  const banglaIssues = auditBangla(records);
  const allUnicodeIssues = [...unicodeIssues, ...banglaIssues];
  console.log(`  Unicode issues: ${allUnicodeIssues.length}`);

  // Phase 5: Structure audit
  console.log("Phase 5: Structure audit...");
  const structureIssues = auditStructure(records);
  console.log(`  Structure issues: ${structureIssues.length}`);

  // Phase 6: OCR detection
  console.log("Phase 6: OCR damage detection...");
  const ocrIncidents = detectOCR(records);
  console.log(`  OCR incidents: ${ocrIncidents.length}`);

  // Phase 7: Duplicate detection
  console.log("Phase 7: Duplicate detection...");
  const duplicateGroups = detectDuplicates(records);
  console.log(`  Duplicate groups: ${duplicateGroups.length}`);
  if (verbose) {
    for (const g of duplicateGroups.slice(0, 10)) {
      console.log(`    ${g.type} (${g.similarity}): ${g.records.map((r) => `#${r.id}`).join(", ")}`);
    }
  }

  // Phase 9: Normalization (dry-run)
  console.log("Phase 9: Normalization pipeline (dry-run)...");
  const classifications: ClassificationResult[] = [];
  let autoCount = 0;
  let reviewCount = 0;
  let cleanCount = 0;

  for (const r of records) {
    const fixes = normalizeRecord(r);
    const recordIssues = [
      ...allUnicodeIssues.filter((i) => i.recordId === r.id),
      ...structureIssues.filter((i) => i.recordId === r.id),
    ];

    const reviewReasons: string[] = [];
    // Only flag for review on HIGH-confidence Bangla issues (mangled headers, replacement chars)
    const unicodeHigh = allUnicodeIssues.filter((i) => i.recordId === r.id && i.confidence === "HIGH");
    if (unicodeHigh.some((i) => i.type === "BROKEN_BANGLA")) {
      reviewReasons.push("Bangla corruption (high confidence)");
    }
    if (unicodeHigh.some((i) => i.type === "MOJIBAKE" || i.type === "REPLACEMENT_CHAR" || i.type === "DOUBLE_ENCODING")) {
      reviewReasons.push("Unicode encoding corruption");
    }

    const verdict = reviewReasons.length > 0 ? "REVIEW" : fixes.length > 0 ? "AUTO" : "CLEAN";

    // Phase 18: Quality scoring
    const quality = calculateQualityScore(r, allUnicodeIssues, structureIssues, duplicateGroups);

    classifications.push({
      record: r,
      issues: recordIssues.map((i) => ({
        code: i.type,
        field: "field" in i ? i.field : "record",
        severity: i.confidence === "HIGH" ? "error" : i.confidence === "MEDIUM" ? "warn" : "info",
        detail: "reason" in i ? i.reason : "detail" in i ? i.detail : "",
        confidence: i.confidence,
      })),
      fixes: fixes.map((f) => ({
        ...f,
        field: f.field,
      })),
      qualityScore: quality.total,
      qualityGrade: quality.grade,
      verdict,
      reviewReasons,
    });

    if (verdict === "AUTO") autoCount++;
    else if (verdict === "REVIEW") reviewCount++;
    else cleanCount++;
  }

  console.log(`  Auto-fixable: ${autoCount}`);
  console.log(`  Review required: ${reviewCount}`);
  console.log(`  Clean: ${cleanCount}`);

  // Quality distribution
  const qualityDist: Record<string, number> = {};
  for (const c of classifications) {
    qualityDist[c.qualityGrade] = (qualityDist[c.qualityGrade] ?? 0) + 1;
  }

  // Build inventory (from the source scan result we already have)
  const { inventory } = scanSourceFiles();

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    scope: "source-files",
    inventory,
    unicodeIssues: allUnicodeIssues,
    structureIssues,
    duplicateGroups,
    ocrIncidents,
    classifications,
    totals: {
      scanned: total,
      clean: cleanCount,
      autoFixable: autoCount,
      reviewRequired: reviewCount,
      critical: classifications.filter((c) => c.qualityScore < 50).length,
    },
    qualityDistribution: qualityDist,
    summary: "",
  };

  report.summary = [
    `Scanned ${total} questions.`,
    `${cleanCount} clean, ${autoCount} auto-fixable, ${reviewCount} need review.`,
    `${allUnicodeIssues.length} Unicode issues, ${structureIssues.length} structure issues.`,
    `${duplicateGroups.length} duplicate groups, ${ocrIncidents.length} OCR incidents.`,
  ].join(" ");

  return {
    report,
    unicodeIssues: allUnicodeIssues,
    structureIssues,
    duplicateGroups,
    ocrIncidents,
    classifications,
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith("-"));
  const yes = argv.includes("--yes");
  const verbose = argv.includes("--verbose");

  if (!cmd) {
    usage();
    return;
  }

  console.log("=".repeat(60));
  console.log("  QUESTION BANK QUALITY AUDIT");
  console.log("=".repeat(60));

  // Always scan source files (no DB required)
  const { records, inventory } = scanSourceFiles();
  console.log(`\nSource files: ${inventory.sourceFiles}`);
  console.log(`Questions found: ${inventory.totalQuestions}`);
  console.log(`Subjects: ${inventory.totalSubjects}`);

  switch (cmd) {
    case "audit": {
      const result = runFullAudit(records, verbose);
      const paths = generateAllReports(result.report);
      console.log("\n" + "=".repeat(60));
      console.log("  AUDIT COMPLETE");
      console.log("=".repeat(60));
      console.log(result.report.summary);
      console.log("\nReports written:");
      for (const p of paths) {
        console.log(`  ${p}`);
      }
      break;
    }

    case "normalize": {
      const result = runFullAudit(records, verbose);
      const autoRecords = result.classifications.filter((c) => c.verdict === "AUTO");
      console.log(`\nDry-run: ${autoRecords.length} records would be normalized.`);
      if (verbose) {
        for (const c of autoRecords.slice(0, 20)) {
          console.log(`\n  #${c.record.id} (${c.record.subjectName}):`);
          for (const fix of c.fixes) {
            console.log(`    ${fix.field}: ${fix.codes.join("+")}`);
            if (fix.before.length <= 80) {
              console.log(`      before: ${fix.before}`);
              console.log(`      after:  ${fix.after}`);
            }
          }
        }
      }
      console.log("\nRun with --yes to apply, or use 'normalize:apply'.");
      break;
    }

    case "normalize:apply": {
      if (!yes) {
        console.error("Refusing to write without confirmation. Re-run with --yes.");
        process.exit(1);
      }
      const result = runFullAudit(records, verbose);
      const autoRecords = result.classifications.filter((c) => c.verdict === "AUTO");
      console.log(`\nApplying ${autoRecords.length} HIGH-confidence fixes...`);

      // In a real DB scenario, this would use a transaction.
      // For source files, we'd rewrite the .txt files.
      console.log("Source file normalization not yet implemented (requires DB connection).");
      console.log("Use 'npx tsx scripts/qb-forensics/index.ts apply-source --yes' for source files.");
      console.log("Use 'npx tsx scripts/qb-forensics/index.ts apply --yes' for database records.");

      const paths = generateAllReports(result.report);
      console.log("\nReports written:");
      for (const p of paths) {
        console.log(`  ${p}`);
      }
      break;
    }

    case "validate": {
      console.log("\nRunning post-normalization validation...");
      const result = runFullAudit(records, verbose);
      const paths = generateAllReports(result.report);
      console.log("\n" + "=".repeat(60));
      console.log("  VALIDATION COMPLETE");
      console.log("=".repeat(60));
      console.log(result.report.summary);
      console.log("\nReports written:");
      for (const p of paths) {
        console.log(`  ${p}`);
      }
      break;
    }

    case "report": {
      const result = runFullAudit(records, verbose);
      const paths = generateAllReports(result.report);
      console.log("\nReports written:");
      for (const p of paths) {
        console.log(`  ${p}`);
      }
      break;
    }

    default:
      usage();
  }
}

main().catch((e) => {
  console.error("qb-audit failed:", e);
  process.exitCode = 1;
});

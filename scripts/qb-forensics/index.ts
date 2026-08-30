#!/usr/bin/env tsx
/**
 * scripts/qb-forensics/index.ts
 * ----------------------------------------------------------------------------
 * CLI for the question-bank forensic audit.
 *
 * Usage:
 *   tsx scripts/qb-forensics/index.ts audit            # read-only DB scan -> artifacts
 *   tsx scripts/qb-forensics/index.ts source           # read-only source scan -> artifacts
 *   tsx scripts/qb-forensics/index.ts dry-run          # DB + source dry-run (no writes)
 *   tsx scripts/qb-forensics/index.ts backup [path]    # pg_dump (no writes to DB content)
 *   tsx scripts/qb-forensics/index.ts apply            # transactional DB apply (requires --yes)
 *   tsx scripts/qb-forensics/index.ts apply-source     # write source files (requires --yes)
 *   tsx scripts/qb-forensics/index.ts verify           # post-apply rescan
 *
 * Flags:
 *   --yes         confirm writes (required for apply / apply-source)
 *   --no-source   skip source repair during apply
 * ----------------------------------------------------------------------------
 */

import "dotenv/config";
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { scanDatabase, buildReport } from "./audit";
import { buildSourcePlan, applySourcePlan, sourceFilePath } from "./source";
import { applyFixes, backupDatabase, verifyDatabase } from "./migrate";
import { writeReports, writeMigrationSummary, writeMarkdown, artifactDir, writeJson } from "./report";

const prisma = new PrismaClient();

function usage(): void {
  console.log(`
qb-forensics — question-bank forensic audit & repair
  audit            read-only DB scan -> audit-report.json + review-required.json
  source           read-only source scan (data/ques) -> source-plan.json
  dry-run          DB + source dry-run (no writes)
  backup [path]    pg_dump (default scripts/qb-forensics/artifacts/backup.dump)
  apply            transactional DB apply (needs --yes)
  apply-source     write source files (needs --yes)
  verify           post-apply rescan
`.trim());
}

type AuditRecords = Awaited<ReturnType<typeof scanDatabase>>;
type AuditReportT = ReturnType<typeof buildReport>;

function writeMarkdownFile(report: AuditReportT, records: AuditRecords): void {
  writeFileSync(artifactDir("qb-forensics-report.md"), writeMarkdown(report, records), "utf8");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv.find((a) => !a.startsWith("-"));
  const yes = argv.includes("--yes");
  const noSource = argv.includes("--no-source");
  const extra = argv.find((a) => !a.startsWith("-") && a !== cmd);

  try {
    switch (cmd) {
      case "audit": {
        const records = await scanDatabase(prisma);
        const report = buildReport(records);
        writeReports(records, report);
        writeMarkdownFile(report, records);
        console.log(
          `audit: scanned=${report.totals.scanned} clean=${report.totals.clean} auto=${report.totals.autoFixeable} review=${report.totals.reviewRequired}`,
        );
        break;
      }
      case "source": {
        const plan = buildSourcePlan();
        writeJson("source-plan.json", plan);
        console.log(
          `source: files=${plan.files.length} lines=${plan.repairs.length} auto=${plan.repairs.filter((r) => r.verdict === "AUTO").length} review=${plan.repairs.filter((r) => r.verdict === "REVIEW").length}`,
        );
        console.log(`source dir: ${sourceFilePath()}`);
        break;
      }
      case "dry-run": {
        const records = await scanDatabase(prisma);
        const report = buildReport(records);
        writeReports(records, report);
        writeMarkdownFile(report, records);
        const dbRes = await applyFixes(prisma, records, { dryRun: true });
        let srcLines = -1;
        if (!noSource) {
          const plan = buildSourcePlan();
          const srcRes = applySourcePlan(plan, true);
          writeJson("source-plan.json", plan);
          srcLines = srcRes.fixedLines;
          console.log(`source dry-run: rewritable files=${srcRes.writtenFiles} lines=${srcRes.fixedLines}`);
        }
        writeMigrationSummary({ db: dbRes, source: noSource ? undefined : { dryRun: true, rewritableLines: srcLines } });
        console.log(`dry-run db: updated=${dbRes.updated} reviewed=${dbRes.reviewed} withFixes=${dbRes.withFixes} violations=${dbRes.invariantViolations.length}`);
        break;
      }
      case "backup": {
        const p = extra || artifactDir("backup.dump");
        backupDatabase(p);
        console.log(`backup written: ${p}`);
        break;
      }
      case "apply": {
        if (!yes) {
          console.error("Refusing to write without confirmation. Re-run with --yes (after reviewing dry-run artifacts).");
          process.exit(1);
        }
        const records = await scanDatabase(prisma);
        const dbRes = await applyFixes(prisma, records, { dryRun: false });
        writeMigrationSummary({ db: dbRes, source: noSource ? undefined : "use apply-source" });
        console.log(`apply db: updated=${dbRes.updated} failed=${dbRes.failed} violations=${dbRes.invariantViolations.length}`);
        break;
      }
      case "apply-source": {
        if (!yes) {
          console.error("Refusing to write without confirmation. Re-run with --yes.");
          process.exit(1);
        }
        const plan = buildSourcePlan();
        const res = applySourcePlan(plan, false);
        writeJson("source-plan.json", plan);
        console.log(`apply-source: writtenFiles=${res.writtenFiles} fixedLines=${res.fixedLines}`);
        break;
      }
      case "verify": {
        const records = await verifyDatabase(prisma);
        const report = buildReport(records);
        writeReports(records, report);
        writeMarkdownFile(report, records);
        console.log(`verify: scanned=${report.totals.scanned} auto=${report.totals.autoFixeable} review=${report.totals.reviewRequired} clean=${report.totals.clean}`);
        break;
      }
      default:
        usage();
    }
  } catch (e) {
    console.error(String(e));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("qb-forensics failed:", e);
  process.exitCode = 1;
});
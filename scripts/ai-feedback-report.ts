/**
 * scripts/ai-feedback-report.ts
 * ----------------------------------------------------------------------------
 * AI6 eval loop reader: aggregates the AIFeedback ledger into helpful-rates
 * per intent/provider/model plus top complaint categories, and prints a
 * report for prompt/model decisions (which prompt version to revise, which
 * provider/intent pair underperforms).
 *
 * No UI surface — this is a developer/CLI loop until live volume justifies
 * automation. Numbers only; no LLM involved.
 *
 * Uses Prisma directly (backend service modules carry `server-only`, which
 * cannot load under plain tsx); the pure aggregation is shared from
 * backend/ai/feedback-summary.ts.
 *
 *   npx tsx scripts/ai-feedback-report.ts            (trailing 30 days)
 *   npx tsx scripts/ai-feedback-report.ts --days 7
 * ----------------------------------------------------------------------------
 */
import { PrismaClient } from "@prisma/client";
import { summarizeFeedback } from "../backend/ai/feedback-summary";

const MAX_ROWS = 5000;

async function main() {
  const daysFlag = process.argv.findIndex((a) => a === "--days");
  const windowDays =
    daysFlag >= 0 ? Math.max(1, Math.floor(Number(process.argv[daysFlag + 1]) || 30)) : 30;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const cutoff = new Date(Date.now() - windowDays * 86_400_000);
    const rows = await prisma.aIFeedback.findMany({
      where: { createdAt: { gte: cutoff } },
      select: {
        rating: true,
        category: true,
        message: { select: { intent: true, provider: true, model: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS + 1,
    });
    const truncated = rows.length > MAX_ROWS;
    const summary = summarizeFeedback(rows.slice(0, MAX_ROWS));

    console.log(`# AI feedback report — trailing ${windowDays} day(s)`);
    console.log(`Total: ${summary.total}${truncated ? " (truncated to newest 5000)" : ""}`);
    console.log(
      `Helpful rate: ${summary.helpfulRate == null ? "n/a (no feedback yet)" : `${summary.helpfulRate}%`} ` +
        `(${summary.byRating.HELPFUL} helpful / ${summary.byRating.NOT_HELPFUL} NOT_HELPFUL)`,
    );
    console.log(`\n## By intent`);
    if (summary.byIntent.length === 0) console.log("(none)");
    for (const r of summary.byIntent) {
      console.log(`- ${r.intent}: ${r.helpfulRate ?? "n/a"}% helpful (${r.total})`);
    }
    console.log(`\n## By provider / model`);
    if (summary.byProvider.length === 0) console.log("(none)");
    for (const r of summary.byProvider) {
      console.log(`- ${r.provider} / ${r.model}: ${r.helpfulRate ?? "n/a"}% helpful (${r.total})`);
    }
    console.log(`\n## Complaint categories (worst first)`);
    if (summary.byCategory.length === 0) console.log("(none)");
    for (const r of summary.byCategory.slice(0, 10)) {
      console.log(`- ${r.category}: ${r.notHelpful}/${r.count} not helpful`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("ai-feedback-report.ts")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

/**
 * scripts/migrate-math-llm.ts
 * ---------------------------------------------------------------------------
 * LLM-powered one-time migration: sends existing BCS and Bank Math question
 * rows to Claude (claude-haiku-4-5 by default) in small batches and writes
 * back clean LaTeX-encoded versions.
 *
 * The script is IDEMPOTENT: rows already containing `$...$` delimiters are
 * SKIPPED (they are already canonical). Re-running is always safe.
 *
 * Run (apply):
 *   npx tsx scripts/migrate-math-llm.ts
 *
 * Run (dry-run — shows what WOULD be changed, no DB writes):
 *   npx tsx scripts/migrate-math-llm.ts --dry-run
 *
 * Run (limit to first N rows for a quick test):
 *   npx tsx scripts/migrate-math-llm.ts --limit 20
 *
 * Environment:
 *   DATABASE_URL        — Postgres connection string (reads .env.local first)
 *   ANTHROPIC_API_KEY   — Required; falls back to mock/dry-run if absent
 *
 * The system prompt asks Claude to return ONLY a JSON array with the same
 * length as the input batch, each element being an object:
 *   { question, options: string[], correctAnswer, explanation }
 * All math tokens MUST be wrapped in $...$ (inline) or $$...$$ (display).
 * Plain Unicode math (x², √x, etc.) must be converted to LaTeX equivalents.
 *
 * Safety:
 *   - Preservation check: if Claude drops a non-math word it shouldn't, the
 *     row is flagged `needs_review` and the original is kept.
+ *   - Canonical gate (Phase 3): every LLM record runs through `scanMca`
+ *     (normalize + KaTeX + structure). REJECT verdicts are never written —
+ *     flagged `needs_review`, original kept. AI output is never trusted.
 *   - Schema: never mutates schema — only question/options/correctAnswer/
 *     explanation text fields.
 *   - Auth: ANTHROPIC_API_KEY only from env, never client-visible.
 * ---------------------------------------------------------------------------
 */

import { join } from "path";
import { scanMca } from "./qb-forensics/import-gate";

// ── Interfaces ────────────────────────────────────────────────────────────────

type McqRow = {
  id: number;
  subjectId: number;
  subjectName: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string | null;
};

type LlmMcq = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
};

type MigrationReport = {
  scanned: number;
  skippedAlreadyCanonical: number;
  migrated: number;
  preserved: number; // needed_review kept as original
  failed: number;
  bySubject: Record<string, number>;
  needsReview: { id: number; reason: string }[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BCS_MATH_BN = "গাণিতিক যুক্তি";
const BB_MATH_BN = "03_Mathematics";

/** Number of rows sent to Claude per API call. Keep ≤15 to avoid long output truncation. */
const BATCH_SIZE = 10;

/** Claude model — haiku is cheap, fast, and accurate for JSON transforms. */
const CLAUDE_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You are a precise mathematical typesetting assistant. You receive a JSON array of MCQ objects.

Your task: Convert ALL raw math content (Unicode superscripts like x², subscripts like x₁, square roots like √x, fractions, and all other mathematical notation) to clean LaTeX using $...$ (inline math) and $$...$$ (display math, only for standalone equations).

Rules:
- x² → $x^{2}$
- x₁ → $x_{1}$
- √x → $\\sqrt{x}$
- ³√x → $\\sqrt[3]{x}$
- Fractions like (a+b)/(c+d) → $\\frac{a+b}{c+d}$
- Already-wrapped $...$ spans: keep EXACTLY as-is, do NOT re-wrap
- Bangla text: preserve exactly, no translation
- English prose: preserve exactly, only convert math tokens
- Do NOT add LaTeX around plain text or numbers without math context
- Return ONLY a valid JSON array with the SAME number of elements as input
- Each element: {"question": "...", "options": ["...", "...", "..."], "correctAnswer": "...", "explanation": "..."}
- If a field is empty string, keep it as empty string
- No markdown code fences, no explanation text — raw JSON array ONLY`;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the text already has at least one $...$ or $$...$$ span. */
function isAlreadyCanonical(text: string): boolean {
  return /\$[^$]/.test(text);
}

/** Returns true if any field in the row has unprocessed Unicode math. */
function hasUnicodeMath(row: McqRow): boolean {
  const all = [row.question, ...row.options, row.correctAnswer, row.explanation ?? ""].join(" ");
  return /[²³⁴⁵⁶⁷⁸⁹ⁿ₀₁₂₃₄₅₆₇₈₉√∛∜]/.test(all);
}

/** Returns true if the row needs LLM migration at all. */
function needsMigration(row: McqRow): boolean {
  const allCanonical = [row.question, ...row.options, row.correctAnswer, row.explanation ?? ""]
    .every(isAlreadyCanonical);
  if (allCanonical) return false; // already fully canonical
  return hasUnicodeMath(row);
}

/**
 * Loose preservation check: all non-math Bengali + Latin words from the
 * original must appear in the result. Math symbols are excluded.
 */
function preservationOk(original: string, result: string): boolean {
  // Strip $...$  spans and punctuation, compare word sets
  const strip = (s: string) => s.replace(/\$\$?[\s\S]+?\$\$?/g, " ").replace(/[^\u0980-\u09FF\u0041-\u007A\u0030-\u0039\s]/g, " ");
  const words = (s: string) => new Set(strip(s).split(/\s+/).filter((w) => w.length > 1));
  const origWords = words(original);
  const resWords = words(result);
  for (const w of origWords) {
    if (!resWords.has(w)) return false;
  }
  return true;
}

// ── LLM call ─────────────────────────────────────────────────────────────────

async function callClaude(
  apiKey: string,
  batch: Pick<McqRow, "question" | "options" | "correctAnswer" | "explanation">[],
): Promise<LlmMcq[]> {
  const payload = batch.map((r) => ({
    question: r.question,
    options: r.options,
    correctAnswer: r.correctAnswer,
    explanation: r.explanation ?? "",
  }));

  const body = JSON.stringify({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Convert the math in this JSON array:\n${JSON.stringify(payload, null, 2)}`,
      },
    ],
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as { content: Array<{ text: string }> };
  const raw = data.content[0]?.text ?? "";

  // Strip code fences if Claude adds them despite instructions
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned invalid JSON: ${cleaned.slice(0, 300)}`);
  }

  if (!Array.isArray(parsed) || parsed.length !== batch.length) {
    throw new Error(
      `Claude returned ${Array.isArray(parsed) ? parsed.length : "non-array"} elements; expected ${batch.length}`,
    );
  }
  return parsed as LlmMcq[];
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  // Load env first
  const { config } = await import("dotenv");
  config({ path: join(process.cwd(), ".env.local") });
  config({ path: join(process.cwd(), ".env") });

  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.error("❌  DATABASE_URL is required.");
    process.exit(1);
  }
  if (!apiKey) {
    console.warn("⚠️   ANTHROPIC_API_KEY not set. Running in --dry-run mode (no LLM calls, no DB writes).");
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    // ── Find target subjects ────────────────────────────────────────────────
    const subjects = await prisma.subject.findMany({
      where: { nameBn: { in: [BCS_MATH_BN, BB_MATH_BN] } },
      select: { id: true, nameBn: true },
    });
    if (subjects.length === 0) {
      console.error("❌  No Math subjects found in DB. Run db:seed first.");
      process.exit(1);
    }
    console.log(`✓ Found ${subjects.length} math subject(s): ${subjects.map((s) => s.nameBn).join(", ")}`);

    const subjectIds = subjects.map((s) => s.id);
    const subjectNameMap = new Map(subjects.map((s) => [s.id, s.nameBn]));

    // ── Load rows ──────────────────────────────────────────────────────────
    const allRows: McqRow[] = [];
    let cursor: number | undefined;
    for (;;) {
      const batch = await prisma.question.findMany({
        where: { subjectId: { in: subjectIds }, ...(cursor ? { id: { gt: cursor } } : {}) },
        select: {
          id: true,
          subjectId: true,
          question: true,
          options: true,
          correctAnswer: true,
          explanation: true,
        },
        orderBy: { id: "asc" },
        take: 500,
      });
      if (batch.length === 0) break;
      for (const r of batch) {
        allRows.push({
          id: r.id,
          subjectId: r.subjectId,
          subjectName: subjectNameMap.get(r.subjectId) ?? String(r.subjectId),
          question: r.question,
          options: Array.isArray(r.options) ? (r.options as string[]) : [],
          correctAnswer: r.correctAnswer,
          explanation: typeof r.explanation === "string" ? r.explanation : "",
        });
      }
      cursor = batch[batch.length - 1].id;
      if (limit && allRows.length >= limit) break;
    }

    const candidates = allRows.filter(needsMigration).slice(0, limit);
    const report: MigrationReport = {
      scanned: allRows.length,
      skippedAlreadyCanonical: allRows.length - candidates.length,
      migrated: 0,
      preserved: 0,
      failed: 0,
      bySubject: {},
      needsReview: [],
    };

    console.log(
      `\n📊 Scanned: ${report.scanned} | Needs migration: ${candidates.length} | Already canonical: ${report.skippedAlreadyCanonical}`,
    );
    if (dryRun || !apiKey) {
      console.log(`\n⚡ DRY RUN — First 3 candidates:`);
      for (const r of candidates.slice(0, 3)) {
        console.log(`  id=${r.id} (${r.subjectName}): ${r.question.slice(0, 80)}`);
      }
      console.log(`\nRun without --dry-run and with ANTHROPIC_API_KEY to apply changes.`);
      return;
    }

    // ── Process in batches ────────────────────────────────────────────────
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const slice = candidates.slice(i, i + BATCH_SIZE);
      process.stdout.write(
        `  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(candidates.length / BATCH_SIZE)} (rows ${i + 1}–${Math.min(i + BATCH_SIZE, candidates.length)})… `,
      );

      let llmResults: LlmMcq[];
      try {
        llmResults = await callClaude(apiKey, slice);
      } catch (e) {
        console.error(`FAILED: ${(e as Error).message}`);
        report.failed += slice.length;
        continue;
      }

      for (let j = 0; j < slice.length; j++) {
        const orig = slice[j];
        const next = llmResults[j];
        if (!next) { report.failed++; continue; }

        // Preservation guard
        if (!preservationOk(orig.question, next.question)) {
          report.needsReview.push({ id: orig.id, reason: "question text diverged" });
          report.preserved++;
          continue;
        }

        // Canonical gate: never trust LLM output — normalize + KaTeX +
        // structure check; REJECT verdicts keep the original (Phase 3).
        const gate = scanMca({
          question: next.question ?? "",
          options: Array.isArray(next.options) ? next.options : [],
          correctAnswer: next.correctAnswer ?? "",
          explanation: next.explanation ?? "",
        });
        if (gate.verdict === "REJECT") {
          report.needsReview.push({
            id: orig.id,
            reason: `gate: ${gate.fatal.map((f) => `${f.code}@${f.field}`).join(", ")}`,
          });
          report.preserved++;
          continue;
        }
        const norm = gate.normalized;

        try {
          await prisma.question.update({
            where: { id: orig.id },
            data: {
              question: norm.question ?? next.question,
              options: norm.options ?? next.options,
              correctAnswer: norm.correctAnswer ?? next.correctAnswer,
              explanation: norm.explanation ?? next.explanation ?? orig.explanation,
            },
          });
          report.migrated++;
          report.bySubject[orig.subjectName] = (report.bySubject[orig.subjectName] ?? 0) + 1;
        } catch (e) {
          report.failed++;
          console.warn(`\n  DB write failed for id=${orig.id}: ${(e as Error).message}`);
        }
      }
      console.log("done");
      // Polite rate-limit: 200ms between batches
      await new Promise((r) => setTimeout(r, 200));
    }

    // ── Summary ───────────────────────────────────────────────────────────
    console.log("\n── MIGRATION REPORT ──────────────────────────────────────");
    console.log(`  Scanned:              ${report.scanned}`);
    console.log(`  Already canonical:    ${report.skippedAlreadyCanonical}`);
    console.log(`  Migrated:             ${report.migrated}`);
    console.log(`  Preserved (review):   ${report.preserved}`);
    console.log(`  Failed:               ${report.failed}`);
    console.log(`  By subject:           ${JSON.stringify(report.bySubject)}`);
    if (report.needsReview.length > 0) {
      console.log(`\n⚠️  Rows needing manual review (original kept):`);
      for (const r of report.needsReview) {
        console.log(`    id=${r.id} — ${r.reason}`);
      }
    }
    console.log("\n✓ Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});

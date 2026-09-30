/**
 * tests/qb-import-gate-coverage.test.ts
 * ----------------------------------------------------------------------------
 * Phase 3 enforcement: EVERY script that writes question TEXT must converge
 * through the canonical math gate. A file containing a Question text write
 * (`prisma.question.create|createMany|update|upsert`, `tx.question.update`)
 * must also reference a gate marker (`scanMca`, `normalizeMcqFields`,
 * `normalizeMathContent`, `normalizeMca`, `classifyRow`) — or be listed in
 * ALLOWLIST with a documented non-text reason.
 *
 * This keeps raw-Unicode math (x², √3/2, nested radicals) from ever landing
 * in the DB again, which is what broke Practice-Tab rendering (ADR-029).
 * ----------------------------------------------------------------------------
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

const WRITE_RE = /prisma\.question\.(create|createMany|update|updateMany|upsert)|tx\.question\.update/;
const GATE_RE = /scanMca|normalizeMcqFields|normalizeMathContent|normalizeMca|classifyRow/;

// Scripts that write Question rows but provably never introduce new TEXT.
// `allowedTextFields` = text columns permitted inside `data:{...}` payloads
// (everything else in the TEXT_FIELDS set fails the test). `markers` =
// safety properties a dynamic writer must keep (checked by regex).
const TEXT_FIELDS = new Set([
  "question",
  "options",
  "correctAnswer",
  "explanation",
  "statements",
  "correctAnswers",
]);
const ALLOWLIST: Record<
  string,
  { reason: string; allowedTextFields?: string[]; markers?: RegExp[] }
> = {
  "scripts/migrate-bank-ict-balance.ts": {
    reason: "rewrites stored options order only (permutation of already-gated text, no new text)",
    allowedTextFields: ["options"],
  },
  "scripts/migrate-bank-subjects.ts": {
    reason: "subjectId/topicId moves + dupe drops only (no text writes)",
    allowedTextFields: [],
  },
  "scripts/update-bcs-terms.ts": {
    reason: "bcsTerm metadata only (no text writes)",
    allowedTextFields: [],
  },
  "scripts/qb-forensics/migrate.ts": {
    reason:
      "generic field-migration engine; writes only classified AUTO fixes after invariant() passes, dry-run by default",
    markers: [/invariant\(/, /dryRun/],
  },
};

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      out.push(...tsFiles(p));
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

describe("import-gate coverage — all question-text writers are gated", () => {
  const files = [...tsFiles(join(ROOT, "scripts")), ...tsFiles(join(ROOT, "database"))];
  const writers = files.filter((f) => WRITE_RE.test(readFileSync(f, "utf8")));

  it("finds the known writer set (fails loudly if a new writer appears)", () => {
    expect(writers.length).toBeGreaterThan(0);
    // Every writer must be either gated or allowlisted — no silent third state.
    for (const f of writers) {
      const rel = f.slice(ROOT.length + 1);
      const src = readFileSync(f, "utf8");
      const gated = GATE_RE.test(src);
      const excused = rel in ALLOWLIST;
      expect(
        gated || excused,
        `${rel}: writes Question rows but references no math gate — add scanMca/normalizeMcqFields or document in ALLOWLIST`,
      ).toBe(true);
    }
  });

  it("allowlist entries still hold their documented safety properties", () => {
    for (const [rel, entry] of Object.entries(ALLOWLIST)) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      if (entry.markers) {
        for (const m of entry.markers) {
          expect(src).toMatch(m);
        }
      }
      if (entry.allowedTextFields) {
        // Every static `data:{...}` payload may only carry whitelisted text
        // columns; anything else means the script grew a text write.
        const payloads = src.match(/data:\s*\{([^{}]*)\}/g) ?? [];
        expect(payloads.length).toBeGreaterThan(0);
        for (const p of payloads) {
          const fields = [...p.matchAll(/(\w+)\s*:/g)].map((m) => m[1]);
          for (const f of fields) {
            if (!TEXT_FIELDS.has(f)) continue;
            expect(
              entry.allowedTextFields.includes(f),
              `${rel} (${entry.reason}) now writes text column '${f}' — gate it or update ALLOWLIST`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("the two Phase-3 scripts write gate.normalized fields", () => {
    for (const rel of ["scripts/import-bank-ict.ts", "scripts/import-bcs-mental.ts"]) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(src).toMatch(/scanMca\(\{/);
      expect(src).toMatch(/gate\.verdict === "REJECT"/);
      expect(src).toMatch(/gate\.normalized/);
    }
  });
});

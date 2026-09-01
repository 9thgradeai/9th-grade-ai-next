/**
 * scripts/perf-budget.ts
 * ----------------------------------------------------------------------------
 * Post-build performance budget gate for the CLIENT JS bundle.
 *
 * Reads the production bundle analysis `@next/bundle-analyzer` emits and
 * guards the initial-JS footprint from silent regressions. This is the "Perf
 * budget" gate from docs/PERFORMANCE-OPTIMIZATION.md (§3 Phase 0).
 *
 * Metrics (gzip is what reaches users; parsed is a stable regression signal):
 *   - Asset report     : every client chunk, largest first (parsed + gzip).
 *   - Namespace gzip   : gzip bytes attributed to a module namespace across
 *                        all chunks — Sentry client SDK (aggregate of the
 *                        @sentry/* + @sentry-internal/* packages), framer-motion,
 *                        next (framework runtime floor), first-party src.
 *
 * Two modes (via the `npm run perf:*` scripts):
 *   --baseline  : capture docs/perf/client-baseline.json and exit 0.
 *   (default)   : compare against the baseline; FAIL (exit 1) if:
 *                   - a namespace parsed size regresses > BASELINE_REGRESSION_PCT
 *                     over its captured baseline, OR
 *                   - any single asset gzip exceeds ASSET_GZIP_BUDGET_BYTES, OR
 *                   - the aggregate Sentry client gzip exceeds SENTRY_GZIP_BUDGET_BYTES.
 *
 * Absolute ceilings are fixed so a fresh baseline can never silently ratchet the
 * footprint up; the namespaced comparison additionally catches smaller relative
 * regressions. Requires an ANALYZE build first:
 *   ANALYZE=true next build   (the existing `npm run analyze`).
 */

/* eslint-disable no-console */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ANALYZE_HTML = resolve(process.cwd(), ".next/analyze/client.html");
// Committed reference baseline so CI can diff a fresh build against a
// reviewed "known good" snapshot (not against whatever it just produced).
// `.next/` is gitignored; the baseline must live somewhere committed.
const BASELINE_FILE = resolve(process.cwd(), "docs/perf/client-baseline.json");

// ── Budgets (gzip bytes) and tolerances ─────────────────────────────────
const ASSET_GZIP_BUDGET_BYTES = 90 * 1024; // single chunk ceiling
// @sentry/nextjs + its sibling packages are the largest controllable piece of
// the base floor (~285 KB parsed / ~85 KB gzip). Ceiling it so new Sentry
// integrations can't silently inflate the initial bundle.
const SENTRY_GZIP_BUDGET_BYTES = 92 * 1024;
// Relative parsed-size regression tolerance vs a captured baseline.
const BASELINE_REGRESSION_PCT = 0.05;

interface Asset {
  label: string;
  parsedSize: number;
  gzipSize: number;
  groups?: Group[];
}
interface Group {
  label: string;
  parsedSize?: number;
  groups?: Group[];
}

/** Extract the embedded `window.chartData = [...]` JSON from the analyzer HTML. */
function extractChartData(html: string): Asset[] {
  const marker = "window.chartData =";
  const start = html.indexOf(marker) + marker.length;
  if (start < marker.length) {
    throw new Error(`chartData marker not found in ${ANALYZE_HTML}`);
  }
  let depth = 0;
  let inStr = false;
  let end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error("could not delimit chartData JSON");
  return JSON.parse(html.slice(start, end)) as Asset[];
}

/**
 * Bucket each asset's modules by namespace, then distribute the asset's gzip
 * across namespaces by parsed share (the analyzer gives leaf parsed sizes and
 * asset-level gzip only). Returns namespace -> { parsed, gzip }.
 */
function classify(assets: Asset[]): Map<string, { parsed: number; gzip: number }> {
  const acc = new Map<string, { parsed: number; gzip: number }>();
  const add = (k: string, parsed: number, gzip: number) => {
    const cur = acc.get(k) ?? { parsed: 0, gzip: 0 };
    cur.parsed += parsed;
    cur.gzip += gzip;
    acc.set(k, cur);
  };

  const namespace = (path: string): string => {
    const p = `/${path}`;
    const slash = p.indexOf("/node_modules/");
    if (slash !== -1) {
      const rest = p.slice(slash + "/node_modules/".length);
      if (rest.startsWith("@sentry/")) return "@sentry";
      if (rest.startsWith("@sentry-internal/")) return "@sentry";
      if (rest.startsWith("framer-motion") || rest.startsWith("motion-"))
        return "framer-motion";
      const top = rest.split("/")[0];
      if (top === "next" || top === "@swc") return "next-runtime";
      return "node_modules:other";
    }
    if (p.includes("/frontend/") || p.includes("/app/")) return "first-party";
    return "other";
  };

  for (const asset of assets) {
    if (!asset.groups || asset.parsedSize <= 0) continue;
    const perNs = new Map<string, number>();
    const stack: { node: Group; path: string }[] = asset.groups.map((g) => ({
      node: g,
      path: g.label,
    }));
    while (stack.length) {
      const { node, path } = stack.pop()!;
      if (node.groups) {
        for (const ch of node.groups) stack.push({ node: ch, path: `${path}/${ch.label}` });
      } else {
        const k = namespace(path);
        perNs.set(k, (perNs.get(k) ?? 0) + (node.parsedSize ?? 0));
      }
    }
    for (const [k, parsed] of perNs) {
      const share = parsed / asset.parsedSize;
      add(k, parsed, asset.gzipSize * share);
    }
  }
  return acc;
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface Report {
  "@sentry": { parsed: number; gzip: number };
  "framer-motion": { parsed: number; gzip: number };
  "next-runtime": { parsed: number; gzip: number };
  "first-party": { parsed: number; gzip: number };
  assets: { asset: string; parsed: number; gzip: number }[];
}

function buildReport(assets: Asset[]): Report {
  const ns = classify(assets);
  const pick = (k: string) => ns.get(k) ?? { parsed: 0, gzip: 0 };
  return {
    "@sentry": pick("@sentry"),
    "framer-motion": pick("framer-motion"),
    "next-runtime": pick("next-runtime"),
    "first-party": pick("first-party"),
    assets: assets
      .map((a) => ({ asset: a.label, parsed: a.parsedSize, gzip: a.gzipSize }))
      .sort((a, b) => b.gzip - a.gzip)
      .slice(0, 20),
  };
}

function logReport(r: Report) {
  console.log("\n[perf-budget] namespace (client):");
  for (const k of ["@sentry", "framer-motion", "next-runtime", "first-party"] as const) {
    const v = r[k];
    console.log(
      `  ${k.padEnd(14)} ${formatKB(v.gzip).padStart(8)} gzip  ${formatKB(v.parsed).padStart(8)} parsed`,
    );
  }
  console.log("\n[perf-budget] top client assets by gzip:");
  for (const a of r.assets.slice(0, 12)) {
    console.log(`  ${formatKB(a.gzip).padStart(8)} gzip  ${formatKB(a.parsed).padStart(8)} parsed  ${a.asset}`);
  }
}

function main() {
  if (!existsSync(ANALYZE_HTML)) {
    console.error(
      `[perf-budget] no analyzer output at ${ANALYZE_HTML}.\n` +
        "Run `ANALYZE=true next build` (npm run analyze) first.",
    );
    process.exitCode = 1;
    return;
  }
  const html = readFileSync(ANALYZE_HTML, "utf8");
  const assets = extractChartData(html);
  const report = buildReport(assets);

  if (process.argv.includes("--baseline")) {
    writeFileSync(BASELINE_FILE, JSON.stringify(report, null, 2));
    logReport(report);
    console.log("\n[perf-budget] baseline written to docs/perf/client-baseline.json");
    process.exitCode = 0;
    return;
  }

  if (!existsSync(BASELINE_FILE)) {
    console.error(
      `[perf-budget] no baseline at ${BASELINE_FILE}.\n` +
        "Capture one first: `npm run perf:baseline`.",
    );
    process.exitCode = 1;
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")) as Report;
  logReport(report);

  const failures: string[] = [];
  for (const k of ["@sentry", "framer-motion", "next-runtime", "first-party"] as const) {
    const cur = report[k] as { parsed: number; gzip: number } | undefined;
    const base = baseline[k] as { parsed: number; gzip: number } | undefined;
    if (!cur || !base) continue;
    const deltaPct = base.parsed > 0 ? (cur.parsed - base.parsed) / base.parsed : 0;
    if (deltaPct > BASELINE_REGRESSION_PCT) {
      failures.push(
        `namespace "${k}" +${(deltaPct * 100).toFixed(1)}% parsed ` +
          `(${formatKB(base.parsed)} -> ${formatKB(cur.parsed)}) exceeds ` +
          `+${(BASELINE_REGRESSION_PCT * 100).toFixed(0)}% tolerance`,
      );
    }
  }
  if (report["@sentry"].gzip > SENTRY_GZIP_BUDGET_BYTES) {
    failures.push(
      `@sentry gzip ${formatKB(report["@sentry"].gzip)} exceeds ceiling ${formatKB(SENTRY_GZIP_BUDGET_BYTES)}`,
    );
  }
  for (const a of report.assets) {
    if (a.gzip > ASSET_GZIP_BUDGET_BYTES) {
      failures.push(
        `asset "${a.asset}" gzip ${formatKB(a.gzip)} exceeds ceiling ${formatKB(ASSET_GZIP_BUDGET_BYTES)}`,
      );
    }
  }

  if (failures.length) {
    console.error("\n[perf-budget] FAIL:");
    for (const f of failures) console.error("  - " + f);
    process.exitCode = 1;
    return;
  }
  console.log("\n[perf-budget] OK — within budget.");
  process.exitCode = 0;
}

main();

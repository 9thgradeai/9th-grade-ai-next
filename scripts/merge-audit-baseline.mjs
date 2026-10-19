// scripts/merge-audit-baseline.mjs
// Merges per-tab harvest files (written by the dashboard-audit e2e suite
// under AUDIT_WRITE_BASELINE=1) into tests/e2e/dashboard-audit-baseline.json.
// Run after reviewing the harvest — the baseline is a ratchet, so only
// accept numbers you have triaged. Usage: node scripts/merge-audit-baseline.mjs
import fs from 'node:fs';
import path from 'node:path';

const harvestDir = path.join(process.cwd(), 'test-results', 'audit-harvest');
const baselinePath = path.join(process.cwd(), 'tests', 'e2e', 'dashboard-audit-baseline.json');

if (!fs.existsSync(harvestDir)) {
  console.error(`No harvest directory at ${harvestDir} — run with AUDIT_WRITE_BASELINE=1 first.`);
  process.exit(1);
}

const baseline = {};
const files = fs.readdirSync(harvestDir).filter((f) => f.endsWith('.json')).sort();
for (const file of files) {
  const tab = file.replace(/\.json$/, '');
  const data = JSON.parse(fs.readFileSync(path.join(harvestDir, file), 'utf8'));
  baseline[tab] = {
    overflow: data.overflow,
    touchTargets: data.touchTargets,
    textSizes: data.textSizes,
    axeRules: data.axeRules,
    ...(data.targetSamples ? { targetSamples: data.targetSamples } : {}),
  };
}

fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
const totals = files.reduce(
  (acc, f) => {
    const d = JSON.parse(fs.readFileSync(path.join(harvestDir, f), 'utf8'));
    acc.t += d.touchTargets; acc.s += d.textSizes; acc.o += d.overflow; acc.a += d.axeRules.length;
    return acc;
  },
  { o: 0, t: 0, s: 0, a: 0 },
);
console.log(
  `baseline updated: ${files.length} tabs — overflow ${totals.o}, touch targets ${totals.t}, text sizes ${totals.s}, axe rules ${totals.a}`,
);

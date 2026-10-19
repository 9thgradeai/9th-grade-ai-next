// tests/e2e/dashboard-audit.spec.ts
// P0 guardrail (docs/DASHBOARD_UI_UX_FIX_PLAN.md §4 Phase 0): a full sweep of
// all 19 dashboard tabs — the only such sweep in the repo (practice-audit
// covered practice flows alone). Per tab:
//
//   1. Horizontal-overflow assertion at 320 / 360 / 768 / 1280 / 1536px
//      (dark + bn, then light + en re-check at 360 & 1280).
//   2. Touch-target scan: every visible interactive element ≥44×44px,
//      minus the documented allowlist.
//   3. Text-size scan: no rendered text below the 11px --text-xs floor.
//   4. axe serious/critical scan.
//
// Results ratchet against tests/e2e/dashboard-audit-baseline.json so the
// suite stays green while phases P1–P7 burn the findings down; any
// regression over baseline fails. AUDIT_STRICT=1 ignores the baseline
// (Definition-of-Done gate).
//
// A fresh registered user is used per tab — zero-history is exactly the
// first-run state, so every empty state is audited too.

import { test, expect } from './browser-logs';
import path from 'path';
import fs from 'fs';
import {
  TAB_SLUGS,
  VIEWPORTS,
  AUTH_STATE_PATH,
  usePrefs,
  reloadWithPrefs,
  createAuditUser,
  waitForTabReady,
  checkOverflow,
  collectTouchTargets,
  collectTextSizes,
  axeSeriousOrCritical,
  expectWithinBaseline,
} from './dashboard-audit-helpers';

test.describe('Dashboard audit — all 19 tabs: overflow, targets, type, a11y', () => {
  test.use({ storageState: AUTH_STATE_PATH });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    await createAuditUser(browser, AUTH_STATE_PATH);
  });

  for (const tab of TAB_SLUGS) {
    test(`${tab}`, async ({ page }, testInfo) => {
      test.setTimeout(300_000);
      const tabUrl = `/dashboard/${tab}`;
      await usePrefs(page, 'dark', 'bn');
      await page.goto(tabUrl);
      await waitForTabReady(page, tabUrl);

      // ── 1. Overflow at every breakpoint boundary (dark + bn) ──
      const overflowHits: string[] = [];
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(200);
        overflowHits.push(...(await checkOverflow(page, `dark/bn ${vp.width}px`)));
      }

      // ── 2–4. Target / type / axe scans at desktop width ──
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.waitForTimeout(200);
      const targetHits = await collectTouchTargets(page);
      const textHits = await collectTextSizes(page);
      const axeHits = await axeSeriousOrCritical(page);
      const axeRules = axeHits.map((v) => v.id).sort();

      // ── 1b. Overflow re-check in light + en (theme/locale parity) ──
      await reloadWithPrefs(page, 'light', 'en');
      await waitForTabReady(page, tabUrl);
      for (const vp of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(200);
        overflowHits.push(...(await checkOverflow(page, `light/en ${vp.width}px`)));
      }

      // ── Attach full findings for triage ──
      const findings = {
        overflow: overflowHits.length,
        touchTargets: targetHits.length,
        textSizes: textHits.length,
        axeRules,
        targetSamples: targetHits.slice(0, 10),
      };
      await testInfo.attach(`audit-${tab}`, {
        body: JSON.stringify({ ...findings, overflowHits, targetHits, textHits, axe: axeHits }, null, 2),
        contentType: 'application/json',
      });

      // ── Harvest mode: persist per-tab findings (merged into the baseline
      //    by the maintainer after review — written BEFORE assertions so a
      //    failing test still contributes its numbers). ──
      if (process.env.AUDIT_WRITE_BASELINE === '1') {
        const dir = path.join(process.cwd(), 'test-results', 'audit-harvest');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${tab}.json`), JSON.stringify(findings, null, 2));
      }

      // ── Overflow: hard zero (never baselined — layout must not break) ──
      expect(overflowHits, `horizontal overflow on /dashboard/${tab}`).toEqual([]);

      // ── Targets / type / axe: ratchet ──
      expectWithinBaseline(
        tab,
        { overflow: 0, touchTargets: targetHits.length, textSizes: textHits.length, axeRules },
        `/dashboard/${tab}`,
      );
    });
  }
});

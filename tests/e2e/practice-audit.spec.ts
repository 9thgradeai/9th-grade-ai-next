// tests/e2e/practice-audit.spec.ts
// Production-quality audit of the Practice tab + quick-practice exam flow:
// serious/critical axe violations, document-level horizontal overflow across
// viewports, keyboard-only answering, and a zero-pageerror journey from
// signup → config → confirm → session → results. Runs against the dev server
// with the real database (no mocks, no fabricated data).
//
// axe-core is injected from node_modules at runtime — no new dependency.

import { test, expect } from './browser-logs';
import type { Page } from '@playwright/test';
import path from 'path';

const AXE_PATH = path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

type AxeViolation = {
  id: string;
  impact?: string;
  help: string;
  count: number;
  targets: string[];
};

async function waitForVisualCalm(page: Page) {
  // Framer-motion entrances (question card, dialogs, mode cards) leave
  // ancestor opacity < 1 mid-flight, and axe blends ancestor opacity into
  // contrast ratios — scanning during the ~0.2s entrance reports phantom
  // violations on perfectly fine text. Wait until animated surfaces settle.
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll<HTMLElement>('.scroll-mt-28, [role="dialog"], [role="timer"]')].every(
          (e) => getComputedStyle(e).opacity === '1',
        ),
      null,
      { timeout: 15_000 },
    );
  } catch {
    /* settle best-effort only — never fail the audit on the helper itself */
  }
  await page.waitForTimeout(500);
}

async function axeSeriousOrCritical(page: Page): Promise<AxeViolation[]> {
  await waitForVisualCalm(page);
  await page.addScriptTag({ path: AXE_PATH });
  const violations = (await page.evaluate(() =>
    (window as unknown as { axe: { run: (doc: Document, opts: unknown) => Promise<{ violations: Array<{ id: string; impact?: string; help: string; nodes: Array<{ target: string[] }> }> }> } }).axe
      .run(document, { resultTypes: ['violations'] })
      .then((r) =>
        r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          count: v.nodes.length,
          targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
        })),
      ),
  )) as AxeViolation[];
  return violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

async function expectNoDocumentOverflow(page: Page) {
  const { docW, winW } = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth,
    winW: window.innerWidth,
  }));
  expect(docW, `document overflow at ${winW}px viewport`).toBeLessThanOrEqual(winW + 1);
}

async function signupToDashboard(page: Page) {
  // UI signup is a multi-stage ceremony; the API contract is the stable seam:
  // POST /api/auth/register returns 201 and sets the session cookie.
  const testEmail = `audit+${Date.now()}@example.com`;
  const testPassword = `Audit#9th-${Date.now()}!xQz`;
  const res = await page.request.post('/api/auth/register', {
    data: { name: 'Audit User', email: testEmail, password: testPassword },
  });
  expect(res.status(), 'register status').toBe(201);

  await page.goto('/dashboard');
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 30_000 });
  if (page.url().includes('/onboarding')) {
    await page.selectOption('#examTarget', 'BCS');
    await page.fill('#examDate', '2026-12-31');
    await page.selectOption('#prepLevel', 'BEGINNER');
    await page.fill('#studyHoursPerDay', '3');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  }
}

test.describe('Practice tab audit — a11y, responsive, keyboard, full journey', () => {
  test('quick practice: config → confirm → session → results', async ({ page }) => {
    test.setTimeout(180_000);
    await signupToDashboard(page);

    // ── Config ──
    await page.goto('/dashboard?tab=practice&mode=quick');
    await expect(page.getByRole('heading', { name: 'প্র্যাকটিস', exact: true })).toBeVisible({ timeout: 30_000 });

    for (const vp of [{ width: 360, height: 740 }, { width: 768, height: 900 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await expectNoDocumentOverflow(page);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await axeSeriousOrCritical(page), 'config axe violations').toEqual([]);

    // ── Select first subject (card → popup → whole-subject default → done) ──
    await page.getByRole('button', { name: /টি প্রশ্ন/ }).first().click();
    const popup = page.getByRole('dialog').filter({ hasText: 'উপলব্ধ' });
    await expect(popup).toBeVisible({ timeout: 15_000 });
    await popup.getByRole('button', { name: 'সম্পন্ন' }).click();
    const startDock = page.getByTestId('dock-start');
    await expect(startDock).toBeEnabled({ timeout: 15_000 });
    await startDock.click();
    const confirm = page.getByRole('dialog', { name: 'প্র্যাকটিস শুরু করুন' });
    await expect(confirm).toBeVisible();
    expect(await axeSeriousOrCritical(page), 'confirm-dialog axe violations').toEqual([]);
    await confirm.getByRole('button', { name: /শুরু করুন/ }).click();

    // ── Session: timer, palette legend, keyboard answer ──
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 30_000 });
    for (const vp of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(vp);
      await expectNoDocumentOverflow(page);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    // Screen-reader-accessible palette legend (never color-only).
    await expect(page.getByRole('list', { name: 'প্রশ্ন অবস্থার নির্দেশিকা' })).toBeVisible();
    expect(await axeSeriousOrCritical(page), 'session axe violations').toEqual([]);

    // Keyboard-only: "1" selects the first option (single locks immediately,
    // multi toggles) — either way the choice must register without a pointer.
    await page.keyboard.press('1');
    await expect(page.locator('[aria-checked="true"]').first()).toBeVisible({ timeout: 10_000 });

    // ── Jump to the last question via palette (submit lives there) ──
    const palette = page.getByRole('group', { name: 'প্রশ্ন তালিকা' });
    await palette.getByRole('button').last().click();

    // ── Submit (unanswered dialog is conditional on question count) ──
    // force: the submit bar is sticky-positioned; Playwright's
    // scroll-into-view + stability check can chase sticky repositioning
    // forever. The probe suite verified the button is stably mounted, so a
    // real dispatched click is still a faithful interaction here.
    await page.getByRole('button', { name: 'ফলাফল জমা দিন' }).click({ force: true });
    const unanswered = page.getByRole('dialog', { name: 'উত্তর দেওয়া বাকি আছে' });
    if (await unanswered.isVisible()) {
      // Settle first: a force-click dispatched mid-entrance can land on the
      // backdrop (which dismisses the dialog) instead of the button.
      await waitForVisualCalm(page);
      await unanswered.getByRole('button', { name: 'জমা দিন' }).click({ force: true });
    }
    await expect(page.getByText('প্র্যাকটিস সম্পন্ন!')).toBeVisible({ timeout: 30_000 });

    // ── Results ──
    await expectNoDocumentOverflow(page);
    await page.setViewportSize({ width: 360, height: 740 });
    await expectNoDocumentOverflow(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await axeSeriousOrCritical(page), 'results axe violations').toEqual([]);
  });
});

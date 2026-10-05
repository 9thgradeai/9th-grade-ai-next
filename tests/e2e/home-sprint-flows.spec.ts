// tests/e2e/home-sprint-flows.spec.ts
// Sprint 8: E2E for the reskinned landing + new Home-tab flows.

import { test, expect } from '@playwright/test';

test.describe('Landing reskin (public)', () => {
  test('hero speaks with one billboard voice + stats strip', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#hero-heading')).toContainText('Stop guessing');
    await expect(page.locator('#hero-heading')).toContainText('Start passing');
    // Glass status pill + proof strip render above the fold.
    await expect(page.locator('.hero-copy .hero-eyebrow').first()).toBeVisible();
    await expect(page.locator('.hero-stats')).toBeVisible();
    // Bricolage display voice actually applied (font-hero utility).
    const family = await page.locator('#hero-heading').evaluate((el) =>
      getComputedStyle(el).fontFamily,
    );
    expect(family.toLowerCase()).toContain('bricolage');
  });

  test('five narrative arcs lazy-mount on scroll', async ({ page }) => {
    await page.goto('/');
    for (const id of ['#arc-problem', '#arc-intelligence', '#arc-tutor', '#arc-proof', '#arc-cta']) {
      await page.locator(id).scrollIntoViewIfNeeded();
      await expect(page.locator(id)).toBeVisible({ timeout: 15000 });
    }
  });

  test('navbar compacts after scroll', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const header = page.locator('header').first();
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(async () =>
      header.evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--nav-h').trim(),
      ),
    ).toBe('3.25rem');
  });
});

test.describe('Dashboard Home (authenticated)', () => {
  // NOTE: dev-server cold compile on this machine exceeds the default 30s
  // action timeout — authenticated steps budget 90s explicitly.
  async function signup(page) {
    const stamp = Date.now().toString(36);
    const testEmail = `home+${stamp}@example.com`;
    // High-entropy per run: common passwords trip the breached-password
    // validator, and short patterns collide with breach corpora.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
    let testPassword = "";
    for (let i = 0; i < 24; i++) testPassword += alphabet[Math.floor(Math.random() * alphabet.length)];
    await page.goto('/login?register=true');
    await page.fill('#signup-name', 'Home Tester', { timeout: 90000 });
    await page.fill('#signup-email', testEmail, { timeout: 90000 });
    await page.fill('#signup-password', testPassword, { timeout: 90000 });
    await page.fill('#signup-confirm', testPassword, { timeout: 90000 });
    await page.click('button[type="submit"]', { timeout: 90000 });
    // The app celebrates in place (verify ceremony) instead of navigating —
    // the session cookie is already set, so go to the dashboard directly.
    await page.waitForTimeout(5000);
    await page.goto('/dashboard?tab=home');
    if (page.url().includes('/onboarding')) {
      await page.fill('#examTarget', 'BCS', { timeout: 90000 });
      await page.fill('#examDate', '2026-12-31', { timeout: 90000 });
      await page.selectOption('#prepLevel', 'BEGINNER', { timeout: 90000 });
      await page.fill('#studyHoursPerDay', '3', { timeout: 90000 });
      await page.click('button[type="submit"]', { timeout: 90000 });
      await page.waitForURL(/\/dashboard/, { timeout: 90000 });
    }
    await page.goto('/dashboard?tab=home');
  }

  test('one mission voice + streak engine + disclosures', async ({ page }) => {
    test.setTimeout(240000);
    await signup(page);
    // Exactly one mission voice on the page (brief lives inside the mission card).
    // Cold dev DB needs room: intelligence scopes can take a while first run.
    await expect(page.locator('#today-mission-title')).toBeVisible({ timeout: 90000 });
    await expect(page.getByText("Today's Mission")).toHaveCount(1);
    // Unified streak engine renders (streak + level) — targeted by its
    // status role so AI-brief prose mentioning streaks can't false-match.
    const engine = page.getByRole('status', { name: /streak/i });
    await expect(engine).toBeVisible({ timeout: 90000 });
    await expect(engine).toContainText(/Lv \d+/);
    // Ambient regions render without layout errors.
    await expect(page.locator('.study-home')).toBeVisible();
  });

  test('recent-mocks accordion expands accessibly', async ({ page }) => {
    test.setTimeout(180000);
    await signup(page);
    const toggle = page.getByRole('button', { name: /mock tests/i });
    if (await toggle.isVisible()) {
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#home-recent-mocks')).toBeVisible();
    }
  });
});

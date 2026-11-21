// tests/e2e/home-sprint-flows.spec.ts
// Sprint 8: E2E for the reskinned landing + new Home-tab flows.

import { test, expect } from '@playwright/test';
import { registerViaApi } from './auth-helpers';

test.describe('Landing reskin (public)', () => {
  test('hero speaks with one billboard voice + proof strip', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#om-hero-title')).toContainText('Your syllabus.');
    await expect(page.locator('#om-hero-title')).toContainText('master it.');
    // Live proof chip + product facts render above the fold.
    await expect(page.locator('.om-proof-chip')).toBeVisible();
    await expect(page.locator('.om-meta-chips')).toBeVisible();
    // Display type is actually applied (--font-hero resolves to Bricolage).
    const family = await page.locator('#om-hero-title').evaluate((el) =>
      getComputedStyle(el).fontFamily,
    );
    expect(family.toLowerCase()).toContain('bricolage');
  });

  test('narrative sections render down the page', async ({ page }) => {
    await page.goto('/');
    for (const id of [
      '#om-gallery-title',
      '#om-how-title',
      '#om-agents-title',
      '#om-studio-title',
      '#om-cta-title',
    ]) {
      await page.locator(id).scrollIntoViewIfNeeded();
      await expect(page.locator(id)).toBeVisible({ timeout: 15000 });
    }
  });

  test('header compacts after scroll', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const header = page.locator('[data-om-header]');
    await expect(header).not.toHaveClass(/is-scrolled/);
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect(header).toHaveClass(/is-scrolled/);
  });
});

test.describe('Dashboard Home (authenticated)', () => {
  // Auth is setup here, not the journey under test: register through the
  // real API (the session cookie lands on the page's context) and go
  // straight to the home tab. Replaces the pre-AuthExperience UI helper that
  // filled the old flat /login?register=true form.
  async function signup(page) {
    await registerViaApi(page, 'home');
    await page.goto('/dashboard/home');
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

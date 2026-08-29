// tests/e2e/signup-mock-test.spec.ts
// Critical user journey: Signup → Email verification → Onboarding → First mock test

import { test, expect } from '@playwright/test';

test.describe('Critical User Journey', () => {
  test('signup → verify → onboarding → first mock test', async ({ page }) => {
    const testEmail = `test+${Date.now()}@example.com`;
    const testPassword = 'StrongPass123!';

    // 1. Navigate to signup page
    await page.goto('/login?register=true');
    await expect(page.locator('h1')).toContainText('Create account');

    // 2. Fill signup form
    await page.fill('[name="name"]', 'Test User');
    await page.fill('[name="email"]', testEmail);
    await page.fill('[name="password"]', testPassword);
    await page.click('button[type="submit"]');

    // 3. Should redirect to dashboard (or verify-email if email verification required)
    await page.waitForURL(/\/dashboard|\/verify-email/);

    // If email verification page, we'd need to handle that
    // For now, check if we're on dashboard
    if (page.url().includes('/verify-email')) {
      // In dev mode, the dev link is shown - click it
      const devLink = page.locator('a[href*="devLink"]');
      if (await devLink.isVisible()) {
        await devLink.click();
      }
    }

    // 4. Should be on dashboard now
    await expect(page).toHaveURL(/\/dashboard/);

    // 5. Complete onboarding if prompted
    if (page.url().includes('/onboarding')) {
      await page.selectOption('[name="examTarget"]', 'BCS');
      await page.fill('[name="examDate"]', '2026-12-31');
      await page.selectOption('[name="prepLevel"]', 'BEGINNER');
      await page.fill('[name="studyHoursPerDay"]', '3');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/dashboard/);
    }

    // 6. Navigate to AI Mock Test tab
    await page.goto('/dashboard?tab=ai-mock-test');
    await expect(page.locator('text=AI Mock Test')).toBeVisible();

    // 7. Start a mock test
    await page.click('button:has-text("Start Mock Test")');

    // 8. Verify question card appears
    await expect(page.locator('[data-testid="question-card"], .question-card, text=Question')).toBeVisible({ timeout: 10000 });

    // 9. Answer a question (select first option)
    const firstOption = page.locator('input[type="radio"]').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
    }

    // 10. Submit test
    await page.click('button:has-text("Submit"), button:has-text("Finish")');

    // 11. Verify results page
    await expect(page.locator('text=Result, text=Score, text=Accuracy')).toBeVisible({ timeout: 10000 });
  });

  test('login → dashboard → practice', async ({ page }) => {
    // This test assumes a user exists
    // In CI, the test DB would be seeded
    await page.goto('/login');
    await page.fill('[name="email"]', 'demo@9thgrade.ai');
    await page.fill('[name="password"]', 'demo12345');
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/dashboard/);
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });
});
// tests/e2e/auth-helpers.ts
// Shared auth setup for e2e specs, replacing the pre-AuthExperience helpers
// that targeted the old flat /login?register=true form.
//
// Two entry paths:
//  1. `registerViaApi` — mirrors the pattern proven by
//     dashboard-audit-helpers.createAuditUser: POST /api/auth/register sets
//     the session cookie on the page's context, so subsequent goto() calls
//     are authenticated. Fast and stable; use it when auth is just setup
//     (byos, home-sprint).
//  2. `uiSignup` / `uiLogin` — drive the real AuthExperience wizard (lamp
//     intro skipped via the `unit9-seen` localStorage flag it checks
//     pre-paint). Use these where the auth UI itself is the journey under
//     test (signup-mock-test).
//
// Email verification: registration creates already-verified accounts when no
// email transport is configured (backend/services/user.ts —
// `emailVerified: !hasEmailTransport()`). CI and local e2e run without
// SMTP/Resend, so the verification ceremony auto-completes into the admit
// card without a real mailbox.

import { expect, type Page } from '@playwright/test';

/**
 * High-entropy password in the shape the breach validator accepts
 * (same approach as dashboard-audit-helpers: common/short patterns like
 * "StrongPass123!" trip the breached-password check).
 */
export function makePassword(): string {
  return `E2E#9th-${Date.now()}!xQz${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Register through the real API and land on the dashboard home tab.
 * The session cookie is set by the register response — no ceremony needed.
 * Retries 429s with backoff (RL_REGISTER_PER_MIN=60 on the e2e webServer,
 * but parallel workers can still burst it locally).
 */
export async function registerViaApi(page: Page, label = 'e2e'): Promise<{ email: string; password: string }> {
  const email = `${label}+${Date.now()}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  const password = makePassword();
  const attempt = () =>
    page.request.post('/api/auth/register', {
      data: { name: `${label} Tester`, email, password },
    });
  let res = await attempt();
  for (let i = 0; i < 6 && res.status() === 429; i++) {
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    res = await attempt();
  }
  expect(res.status(), 'register via API should succeed').toBe(201);
  return { email, password };
}

/**
 * Mark the lamp ("pull the cord") intro as seen so AuthExperience starts at
 * the deterministic stage (choice, or the pinned /register signup stage).
 * Must be added before the first goto of an auth page; it persists across
 * all subsequent navigations in the context.
 */
export async function skipLamp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('unit9-seen', '1');
    } catch {
      /* ignore */
    }
  });
}

/**
 * Complete the /onboarding form (all controls are optional; submit routes to
 * /dashboard on success). Assumes we are already on the page.
 */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.fill('#examTarget', 'BCS');
  await page.fill('#examDate', '2026-12-31');
  await page.selectOption('#prepLevel', 'BEGINNER');
  await page.fill('#studyHoursPerDay', '3');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/**
 * Full UI signup journey: lamp skipped → /register → SignupForm → verification
 * ceremony (auto-completes without an email transport) → admit card →
 * "Enter the hall" → /onboarding → /dashboard. Returns the credentials.
 */
export async function uiSignup(page: Page, label = 'critical'): Promise<{ email: string; password: string }> {
  const email = `${label}+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = makePassword();
  await skipLamp(page);
  await page.goto('/register');
  await page.fill('#signup-name', `${label} Tester`);
  await page.fill('#signup-email', email);
  await page.fill('#signup-password', password);
  await page.fill('#signup-confirm', password);
  await page.click('form button[type="submit"]');
  // The signup form unmounts when the wizard enters the verification stage;
  // waiting on its unique field avoids double-submitting while the register
  // request is in flight and disambiguates from the admit card's own
  // "Enter the hall" button (the submit button carries the same label).
  await page.locator('#signup-password').waitFor({ state: 'detached', timeout: 30_000 });
  await page.getByRole('button', { name: 'Enter the hall' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 });
  await completeOnboarding(page);
  return { email, password };
}

/**
 * Full UI login journey: /login → choice screen → "Returning" → LoginForm →
 * admit card → "Enter the hall" → /dashboard. Assumes no active session
 * (clear cookies first if the context registered one).
 */
export async function uiLogin(page: Page, creds: { email: string; password: string }): Promise<void> {
  await skipLamp(page);
  await page.goto('/login');
  await page.getByRole('button', { name: /Returning/ }).click();
  await page.fill('#login-email', creds.email);
  await page.fill('input[name="password"]', creds.password);
  await page.click('form button[type="submit"]');
  // Same double-submit guard as uiSignup: wait for the form's unique field
  // to unmount, then continue from the admit card.
  await page.locator('input[name="password"]').waitFor({ state: 'detached', timeout: 30_000 });
  await page.getByRole('button', { name: 'Enter the hall' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

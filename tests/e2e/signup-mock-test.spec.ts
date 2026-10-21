// tests/e2e/signup-mock-test.spec.ts
// Critical user journey: Signup → Email verification → Onboarding → First mock
// test, and Login → Dashboard → Practice.
//
// The auth UI is the AuthExperience wizard (lamp intro → choice → form →
// verification ceremony → admit card), driven through the shared helpers in
// ./auth-helpers. The AI mock tab lives at /dashboard/ai-mock and its content
// is Bangla-first.

import { test, expect } from './browser-logs';
import { uiSignup, uiLogin, registerViaApi } from './auth-helpers';

test.describe('Critical User Journey', () => {
  test('signup → verify → onboarding → first mock test', async ({ page }) => {
    // Journey budget: register API + ceremony transitions + mock generation
    // (Groq locally, deterministic MockProvider in CI).
    test.setTimeout(180_000);

    // 1–6. UI signup through the wizard; the verification ceremony
    // auto-completes (no email transport in e2e) into the admit card, whose
    // continue button routes to onboarding, completed by the helper.
    await uiSignup(page, 'critical');
    await expect(page).toHaveURL(/\/dashboard/);

    // 7. AI mock tab (tab key is `ai-mock`; heading is Bangla).
    await page.goto('/dashboard/ai-mock');
    await expect(page.getByRole('heading', { name: 'AI মক টেস্ট' })).toBeVisible({ timeout: 30_000 });

    // 8. Configure and generate. MockProvider answers keyless in CI; Groq
    // answers locally — either way questions render.
    //
    // Capture the generation response so a failure reports WHY (status +
    // server message) instead of a bare "submit button not visible" — the
    // tab swallows the error into a banner and leaves the button unmounted,
    // so without this the run tells us nothing about the cause.
    const generateResponse = page.waitForResponse(
      (r) => r.url().includes('/api/ai/mock-test'),
      { timeout: 60_000 },
    );
    await page.getByPlaceholder('যেমন: ইতিহাস').fill('বাংলাদেশ পরিচয়');
    await page.getByRole('button', { name: 'টেস্ট তৈরি করো' }).click();
    const generate = await generateResponse;
    const generateBody = await generate.text().catch(() => '<unreadable>');
    const submitButton = page.getByRole('button', { name: /জমা দাও/ });
    await expect(
      submitButton,
      `mock generation responded ${generate.status()}: ${generateBody}`,
    ).toBeVisible({ timeout: 60_000 });

    // 9. Answer the first question: option buttons are the only buttons with
    // a direct-child `.font-mono` span (the ক./খ. option key).
    await page.locator('button:has(> span.font-mono)').first().click();

    // 10–11. Submit and verify the score renders ("{percentage}%", "0/10"…).
    await submitButton.click();
    await expect(page.getByText(/^\d+%$/).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/^\d+\/\d+$/).first()).toBeVisible();
  });

  test('login → dashboard → practice', async ({ page }) => {
    test.setTimeout(120_000);

    // Provision credentials via the API (auth is setup here, not the journey
    // under test), then exercise the real login UI. clearCookies drops the
    // session the register call created so /login shows the form instead of
    // bouncing authenticated visitors to the dashboard.
    const creds = await registerViaApi(page, 'login');
    await page.context().clearCookies();
    await uiLogin(page, creds);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('#dashboard-content')).toBeVisible({ timeout: 30_000 });

    // Practice tab renders its header and the mode selector (Quick Drill /
    // Custom Exam / Mock Test) — the কুইক প্র্যাকটিস h2 only exists inside
    // the Quick Drill panel, which is not the default active mode.
    await page.goto('/dashboard/practice');
    await expect(page.getByRole('heading', { name: 'প্র্যাকটিস' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Quick Drill/ })).toBeVisible();
  });
});

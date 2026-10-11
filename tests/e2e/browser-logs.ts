// tests/e2e/browser-logs.ts
// Shared Playwright fixture: captures browser-side failures for every test.
//
// - Fails the test on uncaught page exceptions (`pageerror`) — these are
//   always real bugs (React error boundaries aside, nothing should throw
//   uncaught in a user journey).
// - Attaches `console.error` output to the report as context (info only —
//   third-party scripts and benign warnings must not fail the suite).
// - Attaches a screenshot whenever a test fails.

import { test as base, expect } from '@playwright/test';

export const test = base.extend<{ browserErrors: string[] }>({
  // `auto: true` — runs for every test importing from this module, no
  // per-test wiring needed.
  browserErrors: [
    async ({ page }, use, testInfo) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await use(pageErrors);

    if (consoleErrors.length > 0 || pageErrors.length > 0) {
      await testInfo.attach('browser-logs', {
        body: [
          ...pageErrors.map((e) => `pageerror: ${e}`),
          ...consoleErrors.map((e) => `console.error: ${e}`),
        ].join('\n'),
        contentType: 'text/plain',
      });
    }
    if (testInfo.status !== testInfo.expectedStatus) {
      try {
        await testInfo.attach('failure-screenshot', {
          body: await page.screenshot({ fullPage: true }),
          contentType: 'image/png',
        });
      } catch {
        // Page may already be closed — the original failure is what matters.
      }
    }
    expect(
      pageErrors,
      `Uncaught page exceptions:\n${pageErrors.join('\n')}`,
    ).toEqual([]);
  },
    { auto: true },
  ],
});

export { expect };

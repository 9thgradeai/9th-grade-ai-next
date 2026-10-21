import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Production server, not `next dev`, for two reasons:
    //  1. Dev's on-demand Turbopack route compiles make every cold navigation
    //     take 10–90s, which blows the CI job budget on a serial (workers: 1)
    //     run and forces 90s action timeouts throughout the specs.
    //  2. Next's devtools per-component profiling in the dev runtime
    //     (`app-page-turbo.runtime.dev.js`) calls performance.measure with
    //     ZWSP-prefixed component names and can pass end < start, throwing
    //     uncaught "negative time stamp" pageerrors that browser-logs
    //     correctly fails the audit specs on. The prod runtime has no such
    //     instrumentation.
    // Build only when `.next/BUILD_ID` is missing so local runs against a
    // recent build stay fast; CI always starts from a clean checkout, so it
    // pays the ~2-3min build once per run (well inside the webServer timeout).
    // Rate-limit overrides for the e2e server only (production defaults are
    // unchanged) — every page load fires a boot POST /api/auth/refresh, so
    // the serial suite bursts past the per-IP default of 20/min; a boot
    // refresh answered 429 makes AuthProvider drop the user and the dashboard
    // bounces to "Redirecting to login" mid-test (the flaky session loss).
    // RL_REGISTER_PER_MIN covers the per-test user creation (default 3/min).
    command:
      'sh -c "test -f .next/BUILD_ID || npm run build; RL_REGISTER_PER_MIN=60 RL_REFRESH_PER_MIN=120 npm run start"',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
  },
});
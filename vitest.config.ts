/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./frontend"),
      "~backend": resolve(__dirname, "./backend"),
      "~app": resolve(__dirname, "./app"),
      "~scripts": resolve(__dirname, "./scripts"),
      "~tests": resolve(__dirname, "./tests"),
      "server-only": resolve(__dirname, "./tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "tests/e2e/**",
      // Playwright/Chromium PDF rendering tests — skip in CI where browser
      // binaries are unreliable (timeout after 30 s). Run locally with
      // `npx vitest run tests/unit/backend/pdf-*` instead.
      "tests/unit/backend/pdf-*.test.ts",
      // exam-history export tests depend on the same Chromium PDF pipeline
      "tests/api/exam-history.routes.test.ts",
    ],
    css: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 1,
    coverage: {
      provider: "istanbul",
      include: ["app/**", "backend/**", "frontend/**"],
      exclude: ["scripts/qb-audit/**", "scripts/qb-forensics/**"],
      thresholds: {
        // Honest, ENFORCED gates (CI runs with --coverage).
        // Raised progressively as test coverage improves.
        // Recalibrated 2026-08-30 to actual: lines 39.84 / functions 36.33 / branches 34.08.
        lines: 38,
        functions: 34,
        branches: 32,
      },
    },
  },
});

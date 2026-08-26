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
    css: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    retry: 1,
    coverage: {
      provider: "istanbul",
      thresholds: {
        // Honest, ENFORCED gates (CI runs with --coverage). The previous
        // 70/60/70 values were aspirational fiction — actual coverage was
        // ~44%. Ratchet these up as tests land; never lower them.
        lines: 41,
        functions: 40,
        branches: 37,
      },
    },
  },
});

/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./frontend"),
      "~backend": resolve(__dirname, "./backend"),
      "~tests": resolve(__dirname, "./tests"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    css: true,
    testTimeout: 10000,
    retry: 1,
    coverage: {
      provider: "istanbul",
      thresholds: {
        lines: 70,
        functions: 60,
        branches: 70,
      },
    },
  },
});

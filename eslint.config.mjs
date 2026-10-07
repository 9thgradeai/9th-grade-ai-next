import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { ignoreRestSiblings: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: null,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    files: ["backend/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    rules: {
      "no-console": "error",
    },
  },
  {
    files: ["frontend/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error", "process"],
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Inline secret-shape guard (no plugin needed — keep this instead of
      // the removed eslint-plugin-no-secrets/eslint-plugin-security stubs).
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/^(sk-|key-|secret-|password-|AKIA|ASIA)[A-Za-z0-9+/=]{20,}/i]",
          message: "Potential hardcoded secret detected. Use environment variables instead.",
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "public/**",
    "next-env.d.ts",
    ".storybook/**/*",
    "**/*.stories.tsx",
    ".kilo/**",
    ".opencode/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;

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
    },
  },
  // No-secrets rule (uncomment when eslint-plugin-no-secrets is installed)
  // {
  //   plugins: { "no-secrets": noSecretsPlugin },
  //   rules: {
  //     "no-secrets": ["error", { excludePatterns: ["NEXT_PUBLIC_"] }],
  //   },
  // },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/^(sk-|key-|secret-|password-|AKIA|ASIA)[A-Za-z0-9+/=]{20,}/i]",
          message: "Potential hardcoded secret detected. Use environment variables instead.",
        },
      ],
    },
  },
  // Security plugin rules (uncomment when eslint-plugin-security is installed)
  // {
  //   plugins: { security: securityPlugin },
  //   rules: {
  //     "security/detect-object-injection": "warn",
  //     "security/detect-non-literal-regexp": "warn",
  //     "security/detect-unsafe-regex": "error",
  //     "security/detect-buffer-noassert": "error",
  //     "security/detect-child-process": "warn",
  //     "security/detect-disable-mustache-escape": "error",
  //     "security/detect-eval-with-expression": "error",
  //     "security/detect-non-literal-fs-filename": "warn",
  //     "security/detect-non-literal-require": "warn",
  //     "security/detect-pseudo-random-prng": "error",
  //   },
  // },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".storybook/**/*",
    "**/*.stories.tsx",
  ]),
]);

export default eslintConfig;

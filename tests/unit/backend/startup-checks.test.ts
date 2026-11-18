// Unit tests for the first-release startup configuration checks
// (backend/lib/startup-checks.ts). The checks read process.env directly —
// the same contract as getEmailTransportName() — so each test stubs the env
// keys it cares about and restores them afterward.

import { afterEach, describe, expect, it } from "vitest";

import { collectStartupWarnings, logStartupWarnings } from "~backend/lib/startup-checks";

const STUBBED_KEYS = [
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASS",
  "RESEND_API_KEY",
  "GROQ_API_KEY",
  "ANTHROPIC_API_KEY",
  "REDIS_URL",
  "NODE_ENV",
] as const;

const saved: Record<string, string | undefined> = {};

function stubEnv(values: Partial<Record<(typeof STUBBED_KEYS)[number], string | undefined>>): void {
  for (const key of STUBBED_KEYS) {
    if (!(key in saved)) saved[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  for (const key of STUBBED_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
    delete saved[key];
  }
});

function codes(): string[] {
  return collectStartupWarnings().map((w) => w.code);
}

describe("collectStartupWarnings", () => {
  it("returns no warnings when transport, AI keys and Redis are configured", () => {
    stubEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "user@gmail.com",
      SMTP_PASS: "app-password",
      GROQ_API_KEY: "gsk_test",
      REDIS_URL: "redis://localhost:6379",
      NODE_ENV: "production",
    });
    expect(codes()).toEqual([]);
  });

  it("warns when no email transport is configured", () => {
    stubEnv({ GROQ_API_KEY: "gsk_test", NODE_ENV: "development" });
    expect(codes()).toContain("email.transport.missing");
  });

  it("accepts RESEND_API_KEY as an email transport", () => {
    stubEnv({ RESEND_API_KEY: "re_test", GROQ_API_KEY: "gsk_test", NODE_ENV: "development" });
    expect(codes()).not.toContain("email.transport.missing");
  });

  it("warns when neither GROQ nor Anthropic key is set", () => {
    stubEnv({ NODE_ENV: "development" });
    expect(codes()).toContain("ai.keys.missing");
  });

  it("does not warn about AI keys when only Anthropic is set", () => {
    stubEnv({ ANTHROPIC_API_KEY: "sk-ant-test", NODE_ENV: "development" });
    expect(codes()).not.toContain("ai.keys.missing");
  });

  it("warns about REDIS_URL only in production", () => {
    stubEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "user@gmail.com",
      SMTP_PASS: "app-password",
      GROQ_API_KEY: "gsk_test",
      NODE_ENV: "development",
    });
    expect(codes()).not.toContain("redis.missing");

    stubEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "user@gmail.com",
      SMTP_PASS: "app-password",
      GROQ_API_KEY: "gsk_test",
      NODE_ENV: "production",
    });
    expect(codes()).toContain("redis.missing");
  });

  it("every warning carries a stable code and a remediation message", () => {
    stubEnv({ NODE_ENV: "production" });
    const warnings = collectStartupWarnings();
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    for (const warning of warnings) {
      expect(warning.code).toMatch(/^[a-z]+(\.[a-z]+)+$/);
      expect(warning.message.length).toBeGreaterThan(20);
    }
  });
});

describe("logStartupWarnings", () => {
  it("never throws with a degraded config and returns the warnings", () => {
    stubEnv({ NODE_ENV: "production" });
    const warnings = logStartupWarnings();
    expect(warnings.map((w) => w.code)).toContain("email.transport.missing");
  });

  it("returns an empty list for a fully-configured production", () => {
    stubEnv({
      SMTP_HOST: "smtp.gmail.com",
      SMTP_USER: "user@gmail.com",
      SMTP_PASS: "app-password",
      GROQ_API_KEY: "gsk_test",
      REDIS_URL: "redis://localhost:6379",
      NODE_ENV: "production",
    });
    expect(logStartupWarnings()).toEqual([]);
  });
});

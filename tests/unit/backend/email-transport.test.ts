// @vitest-environment node
//
// Email transport selection: SMTP is preferred, then Resend, then none. Ensures
// `hasEmailTransport()` reflects the configured transport so account flows skip
// auto-verification once a real transport (SMTP or Resend) is installed.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getEmailTransportName,
  hasEmailTransport,
} from "~backend/lib/email";

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "EMAIL_FROM",
  "RESEND_API_KEY",
];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEmailTransportName", () => {
  it("returns none when no transport env vars are set", () => {
    for (const k of ENV_KEYS) vi.stubEnv(k, "");
    expect(getEmailTransportName()).toBe("none");
    expect(hasEmailTransport()).toBe(false);
  });

  it("prefers smtp when SMTP credentials are present, even with RESEND set", () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("SMTP_USER", "me@gmail.com");
    vi.stubEnv("SMTP_PASS", "app-password");
    vi.stubEnv("RESEND_API_KEY", "re_abc");
    expect(getEmailTransportName()).toBe("smtp");
    expect(hasEmailTransport()).toBe(true);
  });

  it("does not select smtp when credentials are incomplete", () => {
    vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
    vi.stubEnv("RESEND_API_KEY", "re_abc");
    expect(getEmailTransportName()).toBe("resend");
  });

  it("returns resend when only RESEND_API_KEY is set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_abc");
    expect(getEmailTransportName()).toBe("resend");
    expect(hasEmailTransport()).toBe(true);
  });
});

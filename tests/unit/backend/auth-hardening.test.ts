// @vitest-environment node
//
// Auth hardening suite — session versioning, CSRF origin checks, timing-safe
// login material, cookie-extraction boundaries, and password length guards.
// Uses the Node environment because the JWT claims test signs real tokens with
// jose, which fails its cross-realm Uint8Array check inside jsdom.

import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { extractSessionToken, signSession } from "~backend/auth";
import { assertSameOrigin } from "~app/api/_middleware";
import {
  validateRegisterInput,
  validateChangePasswordInput,
  validateLoginInput,
} from "~backend/validation";

function reqWith(headers: Record<string, string>, method = "POST"): Request {
  return new Request("https://app.example.com/api/auth/login", {
    method,
    headers,
  });
}

describe("extractSessionToken", () => {
  it("reads the session token from a normal cookie header", () => {
    const req = reqWith({ cookie: "auth_token=abc.def.ghi; other=1" });
    expect(extractSessionToken(req)).toBe("abc.def.ghi");
  });

  it("ignores decoy cookies whose name merely contains auth_token", () => {
    const req = reqWith({ cookie: "xauth_token=evil; foo=bar" });
    expect(extractSessionToken(req)).toBeNull();
  });

  it("matches at start-of-header and after semicolons only", () => {
    const first = extractSessionToken(reqWith({ cookie: "auth_token=a; xauth_token=b" }));
    expect(first).toBe("a");

    const after = extractSessionToken(reqWith({ cookie: "theme=dark;auth_token=t2" }));
    expect(after).toBe("t2");
  });

  it("returns null when no cookies are present", () => {
    expect(extractSessionToken(reqWith({}))).toBeNull();
  });
});

describe("assertSameOrigin (CSRF defense-in-depth)", () => {
  it("allows same-origin mutating requests", () => {
    expect(() =>
      assertSameOrigin(reqWith({ origin: "https://app.example.com", host: "app.example.com" })),
    ).not.toThrow();
  });

  it("rejects cross-origin mutating requests with 403", () => {
    try {
      assertSameOrigin(reqWith({ origin: "https://evil.example.net", host: "app.example.com" }));
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
      expect((err as { code?: string }).code).toMatch(/^CSRF_ORIGIN_/);
    }
  });

  it("allows requests without an Origin header (non-browser clients)", () => {
    expect(() =>
      assertSameOrigin(reqWith({ host: "app.example.com" })),
    ).not.toThrow();
  });

  it("honors x-forwarded-host behind proxies", () => {
    expect(() =>
      assertSameOrigin(
        reqWith({
          origin: "https://prod.example.com",
          "x-forwarded-host": "prod.example.com",
          host: "internal:3000",
        }),
      ),
    ).not.toThrow();

    try {
      assertSameOrigin(
        reqWith({
          origin: "https://evil.example.net",
          "x-forwarded-host": "prod.example.com",
        }),
      );
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as { statusCode?: number }).statusCode).toBe(403);
    }
  });

  it("rejects malformed Origin headers", () => {
    expect(() =>
      assertSameOrigin(reqWith({ origin: ":://bad", host: "app.example.com" })),
    ).toThrow();
  });
});

describe("password length guards (bcrypt CPU bound)", () => {
  it("register rejects passwords over 128 chars", () => {
    const body = {
      name: "Test User",
      email: "a@b.com",
      password: "x".repeat(129),
    };
    expect(() => validateRegisterInput(body)).toThrow(/at most 128/);
  });

  it("register still accepts 8..128 char passwords", () => {
    expect(() => validateRegisterInput({ name: "T U", email: "a@b.com", password: "x".repeat(128) })).not.toThrow();
  });

  it("change-password rejects oversized newPassword and login rejects oversized passwords", () => {
    expect(() =>
      validateChangePasswordInput({
        currentPassword: "cur",
        newPassword: "y".repeat(129),
        confirmPassword: "y".repeat(129),
      }),
    ).toThrow(/at most 128/);

    expect(() => validateLoginInput({ email: "a@b.com", password: "z".repeat(129) })).toThrow(
      /at most 128/,
    );
  });
});

describe("session versioning claims", () => {
  // tests/setup.ts sets AUTH_SECRET for the suite; mirror it to verify payloads.
  const secret = new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "test-secret-key-for-unit-tests-only",
  );

  it("signSession embeds the ver claim when provided", async () => {
    const token = await signSession({ email: "a@b.com", ver: 3 });
    const { payload } = await jwtVerify(token, secret);
    expect(payload.email).toBe("a@b.com");
    expect((payload as { ver?: number }).ver).toBe(3);
  });

  it("omits ver when not provided (legacy-token semantics)", async () => {
    const token = await signSession({ email: "a@b.com" });
    const { payload } = await jwtVerify(token, secret);
    expect((payload as { ver?: number }).ver).toBeUndefined();
  });
});

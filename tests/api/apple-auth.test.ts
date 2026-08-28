// @vitest-environment node
//
// Route-handler integration tests for the Apple OAuth flow. The Apple helpers
// and the user service are mocked so we exercise the route orchestration
// (availability guard, state/nonce cookie, exchange, find-or-create, session
// cookie, redirect) without network calls.

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("~backend/auth/apple", () => ({
  isAppleEnabled: () =>
    Boolean(
      process.env.APPLE_CLIENT_ID &&
        process.env.APPLE_TEAM_ID &&
        process.env.APPLE_KEY_ID &&
        process.env.APPLE_PRIVATE_KEY,
    ),
  getAppleRedirectUri: (origin: string) => `${origin}/api/auth/apple/callback`,
  generateOAuthState: () => "state-apple-123",
  generateNonce: () => "nonce-apple-456",
  buildAppleAuthUrl: ({ state, nonce }: { state: string; nonce: string }) =>
    `https://appleid.apple.com/auth/authorize?state=${state}&nonce=${nonce}`,
  exchangeCodeForTokens: vi.fn(async () => ({ idToken: "fake.apple.id.token" })),
  verifyAppleIdToken: vi.fn(async () => ({
    sub: "apple-sub-1",
    email: "auser@example.com",
    emailVerified: true,
    name: "Apple User",
  })),
}));

function rawUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "usr_apple",
    email: "auser@example.com",
    tokenVersion: 0,
    onboarded: false,
    ...overrides,
  };
}

vi.mock("~backend/services/user", () => ({
  findOrCreateAppleUser: vi.fn(async () => rawUser()),
}));

import { GET as appleStartGET } from "~app/api/auth/apple/route";
import { GET as appleCallbackGET } from "~app/api/auth/apple/callback/route";
import { resetRateLimitStore } from "~backend/rate-limit";

const BASE = "https://app.example.com";

const APPLE_ENV = {
  APPLE_CLIENT_ID: "com.example.app",
  APPLE_TEAM_ID: "TEAM123",
  APPLE_KEY_ID: "KEY123",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
};

beforeEach(() => {
  vi.clearAllMocks();
  void resetRateLimitStore();
  for (const k of Object.keys(APPLE_ENV)) delete process.env[k];
});

describe("GET /api/auth/apple (start)", () => {
  it("307-redirects to Apple and plants the oauth_apple cookie when enabled", async () => {
    Object.assign(process.env, APPLE_ENV);
    const res = await appleStartGET(
      new Request(`${BASE}/api/auth/apple?redirect=/dashboard`, { method: "GET" }),
    );

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("appleid.apple.com");
    expect(location).toContain("state=state-apple-123");
    expect(location).toContain("nonce=nonce-apple-456");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("oauth_apple=");
    expect(setCookie).toContain("HttpOnly");
    expect(decodeURIComponent(setCookie)).toContain("state-apple-123");
  });

  it("redirects to /login?error=apple_unavailable when Apple is not configured", async () => {
    const res = await appleStartGET(
      new Request(`${BASE}/api/auth/apple`, { method: "GET" }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("error=apple_unavailable");
  });
});

describe("GET /api/auth/apple/callback", () => {
  const cookieValue = encodeURIComponent(
    JSON.stringify({ state: "state-apple-123", nonce: "nonce-apple-456", redirect: "/dashboard" }),
  );

  function callbackRequest(params: string) {
    return new Request(`${BASE}/api/auth/apple/callback?${params}`, {
      method: "GET",
      headers: { cookie: `oauth_apple=${cookieValue}` },
    });
  }

  it("creates/finds the Apple user, sets the session cookie, and lands on /onboarding for new users", async () => {
    Object.assign(process.env, APPLE_ENV);
    const res = await appleCallbackGET(
      callbackRequest("code=auth-code&state=state-apple-123"),
    );

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location.endsWith("/onboarding")).toBe(true);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("auth_token="); // session cookie set
    expect(decodeURIComponent(setCookie)).toContain("oauth_apple="); // one-time cookie cleared
  });

  it("redirects to /login when the oauth cookie is missing", async () => {
    const res = await appleCallbackGET(
      new Request(`${BASE}/api/auth/apple/callback?code=auth-code&state=state-apple-123`, {
        method: "GET",
      }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("error=apple_state_missing");
  });

  it("rejects a state mismatch (CSRF guard) without exchanging the code", async () => {
    Object.assign(process.env, APPLE_ENV);
    const res = await appleCallbackGET(callbackRequest("code=auth-code&state=WRONG-STATE"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("error=apple_state_mismatch");
    const { exchangeCodeForTokens } = await import("~backend/auth/apple");
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("surfaces an upstream Apple error query param", async () => {
    const res = await appleCallbackGET(callbackRequest("error=access_denied"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("error=apple_access_denied");
  });
});

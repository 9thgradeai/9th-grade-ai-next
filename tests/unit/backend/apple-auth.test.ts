// @vitest-environment node
//
// Unit tests for the Apple Sign In helpers (backend/auth/apple.ts). The `jose`
// crypto primitives are mocked so we exercise the orchestration (state/nonce
// primitives, auth-URL construction, token exchange) without network or real
// key material. The verifyAppleIdToken error paths are covered by the
// route-handler integration test.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Create mock functions using vi.hoisted so they're available before imports
const { jwtVerifyMock, signJWTMock } = vi.hoisted(() => {
  const jwtVerify = vi.fn();
  const sign = vi.fn().mockResolvedValue("signed.jwt");
  const SignJWT = vi.fn(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setIssuer: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    setAudience: vi.fn().mockReturnThis(),
    setSubject: vi.fn().mockReturnThis(),
    sign,
  }));
  return { jwtVerifyMock: jwtVerify, signJWTMock: SignJWT };
});

vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify: jwtVerifyMock,
  SignJWT: signJWTMock,
  importPKCS8: () => ({}),
}));

import {
  isAppleEnabled,
  buildAppleAuthUrl,
  generateOAuthState,
  generateNonce,
  exchangeCodeForTokens,
  sha256Base64Url,
} from "~backend/auth/apple";

const APPLE_ENV = {
  APPLE_CLIENT_ID: "com.example.app",
  APPLE_TEAM_ID: "TEAM123",
  APPLE_KEY_ID: "KEY123",
  APPLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----",
};

beforeEach(() => {
  jwtVerifyMock.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ id_token: "x" }) })),
  );
  for (const k of Object.keys(APPLE_ENV)) delete process.env[k];
});

describe("isAppleEnabled", () => {
  it("is false when any Apple env var is missing", () => {
    expect(isAppleEnabled()).toBe(false);
  });

  it("is true when all Apple env vars are set", () => {
    Object.assign(process.env, APPLE_ENV);
    expect(isAppleEnabled()).toBe(true);
  });
});

describe("state / nonce primitives", () => {
  it("generateOAuthState returns a high-entropy hex string", () => {
    const s = generateOAuthState();
    expect(s).toMatch(/^[a-f0-9]{64}$/);
  });

  it("generateNonce returns a base64url string", () => {
    const n = generateNonce();
    expect(n).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("buildAppleAuthUrl", () => {
  beforeEach(() => {
    Object.assign(process.env, APPLE_ENV);
  });

  it("includes the client id, query response mode, state and nonce", () => {
    const url = buildAppleAuthUrl({
      state: "state-1",
      nonce: "nonce-1",
      redirectUri: "https://app.example.com/api/auth/apple/callback",
    });
    expect(url).toContain("https://appleid.apple.com/auth/authorize");
    expect(url).toContain("client_id=com.example.app");
    expect(url).toContain("response_mode=query");
    expect(url).toContain("scope=name+email");
    expect(url).toContain("state=state-1");
    expect(url).toContain("nonce=nonce-1");
  });
});

describe("exchangeCodeForTokens", () => {
  beforeEach(() => {
    Object.assign(process.env, APPLE_ENV);
  });

  it("returns the id_token on a successful exchange", async () => {
    const { idToken } = await exchangeCodeForTokens("code-1", "https://x/cb");
    expect(idToken).toBe("x");
  });

  it("throws on a non-2xx Apple response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({ error: "invalid_grant" }) })),
    );
    await expect(exchangeCodeForTokens("code-1", "https://x/cb")).rejects.toThrow();
  });

  it("throws when the network call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(exchangeCodeForTokens("code-1", "https://x/cb")).rejects.toThrow();
  });
});

describe("sha256Base64Url", () => {
  it("is deterministic and base64url-encoded", () => {
    const a = sha256Base64Url("hello");
    expect(a).toBe(sha256Base64Url("hello"));
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
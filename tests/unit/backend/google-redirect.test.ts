import { describe, it, expect, beforeEach } from "vitest";
import { getGoogleRedirectUri, getCanonicalAppOrigin } from "~backend/auth/google";

const ORIGIN = "https://9th-grade-ai.vercel.app";
const CALLBACK = `${ORIGIN}/api/auth/google/callback`;

beforeEach(() => {
  delete process.env.GOOGLE_AUTH_REDIRECT_URI;
  delete process.env.GOOGLE_REDIRECT_URI;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("getGoogleRedirectUri", () => {
  it("prefers the explicit GOOGLE_AUTH_REDIRECT_URI and strips trailing slashes", () => {
    process.env.GOOGLE_AUTH_REDIRECT_URI = `${CALLBACK}/`;
    expect(getGoogleRedirectUri(ORIGIN)).toBe(CALLBACK);
  });

  it("ignores a legacy GOOGLE_REDIRECT_URI pointing at the storage callback", () => {
    process.env.GOOGLE_REDIRECT_URI = `${ORIGIN}/api/storage/google/callback`;
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
    expect(getGoogleRedirectUri(ORIGIN)).toBe(CALLBACK);
  });

  it("honors a legacy GOOGLE_REDIRECT_URI that points at the sign-in callback", () => {
    process.env.GOOGLE_REDIRECT_URI = CALLBACK;
    expect(getGoogleRedirectUri("https://preview-123.vercel.app")).toBe(CALLBACK);
  });

  it("falls back to NEXT_PUBLIC_APP_URL, then the request origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    expect(getGoogleRedirectUri("https://other.dev")).toBe(
      "https://example.com/api/auth/google/callback",
    );
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getGoogleRedirectUri("http://localhost:3000")).toBe(
      "http://localhost:3000/api/auth/google/callback",
    );
  });

  it("rejects non-https explicit URIs in production", () => {
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_AUTH_REDIRECT_URI = "http://9th-grade-ai.vercel.app/api/auth/google/callback";
    expect(() => getGoogleRedirectUri(ORIGIN)).toThrow(/https/);
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
  });
});

describe("getCanonicalAppOrigin", () => {
  it("derives the origin from the explicit override, app URL, or request", () => {
    expect(getCanonicalAppOrigin("https://preview-1.vercel.app")).toBe("https://preview-1.vercel.app");
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
    expect(getCanonicalAppOrigin("https://preview-1.vercel.app")).toBe(ORIGIN);
    process.env.GOOGLE_AUTH_REDIRECT_URI = CALLBACK;
    expect(getCanonicalAppOrigin("https://anything.dev")).toBe(ORIGIN);
  });
});

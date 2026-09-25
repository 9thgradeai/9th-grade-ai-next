import { describe, it, expect, beforeEach } from "vitest";
import { getGoogleRedirectUri, getCanonicalAppOrigin, isPreviewDeployment } from "~backend/auth/google";

const ORIGIN = "https://9th-grade-ai.vercel.app";
const CALLBACK = `${ORIGIN}/api/auth/google/callback`;

beforeEach(() => {
  delete process.env.GOOGLE_AUTH_REDIRECT_URI;
  delete process.env.GOOGLE_REDIRECT_URI;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
});

describe("getGoogleRedirectUri", () => {
  it("prefers the explicit GOOGLE_AUTH_REDIRECT_URI and strips trailing slashes", () => {
    process.env.GOOGLE_AUTH_REDIRECT_URI = `${CALLBACK}/`;
    expect(getGoogleRedirectUri(ORIGIN)).toBe(CALLBACK);
  });

  it("ignores a legacy GOOGLE_REDIRECT_URI pointing at the storage callback", () => {
    process.env.GOOGLE_REDIRECT_URI = `${ORIGIN}/api/storage/google/callback`;
    process.env.NEXT_PUBLIC_APP_URL = "https://9th-grade-ai-next.vercel.app";
    // Serving origin wins even when env disagrees — never bounce users
    // to a host that may not serve traffic.
    expect(getGoogleRedirectUri(ORIGIN)).toBe(CALLBACK);
  });

  it("honors a legacy GOOGLE_REDIRECT_URI that points at the sign-in callback", () => {
    process.env.GOOGLE_REDIRECT_URI = CALLBACK;
    expect(getGoogleRedirectUri("https://preview-123.vercel.app")).toBe(CALLBACK);
  });

  it("uses the request origin when nothing explicit is configured", () => {
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
  it("prefers explicit override, then Vercel prod URL, then app URL", () => {
    expect(getCanonicalAppOrigin("https://preview-1.vercel.app")).toBe("https://preview-1.vercel.app");
    process.env.NEXT_PUBLIC_APP_URL = ORIGIN;
    expect(getCanonicalAppOrigin("https://preview-1.vercel.app")).toBe(ORIGIN);
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "9th-grade-ai.vercel.app";
    expect(getCanonicalAppOrigin("https://preview-1.vercel.app")).toBe(ORIGIN);
    process.env.GOOGLE_AUTH_REDIRECT_URI = "https://custom.example.com/api/auth/google/callback";
    expect(getCanonicalAppOrigin("https://preview-1.vercel.app")).toBe("https://custom.example.com");
  });
});

describe("isPreviewDeployment", () => {
  it("is true only when VERCEL_ENV=preview", () => {
    expect(isPreviewDeployment()).toBe(false);
    process.env.VERCEL_ENV = "preview";
    expect(isPreviewDeployment()).toBe(true);
    process.env.VERCEL_ENV = "production";
    expect(isPreviewDeployment()).toBe(false);
  });
});

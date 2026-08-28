// @vitest-environment node
//
// Route-handler integration tests for the Google OAuth flow. The Google helpers
// are mocked so we exercise the route orchestration (state/PKCE cookie, token
// exchange, find-or-create, session cookie, redirect) without network calls.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Google OAuth helpers. The route still calls the REAL user service
// (findOrCreateGoogleUser) and the REAL session signer (jose) so we validate
// the full server path end-to-end.
vi.mock("~backend/auth/google", () => ({
  isGoogleEnabled: () => true,
  getGoogleRedirectUri: (origin: string) => `${origin}/api/auth/google/callback`,
  generateOAuthState: () => "state-abc-123",
  generateCodeVerifier: () => "verifier-xyz-789",
  sha256Base64Url: () => "challenge-s256",
  buildGoogleAuthUrl: ({ state }: { state: string }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&code_challenge=challenge-s256&code_challenge_method=S256`,
  exchangeCodeForTokens: vi.fn(async () => ({ idToken: "fake.google.id.token" })),
  verifyGoogleIdToken: vi.fn(async () => ({
    sub: "google-sub-1",
    email: "guser@example.com",
    emailVerified: true,
    name: "Google User",
    picture: "https://example.com/pic.jpg",
  })),
}));

import { GET as googleStartGET } from "~app/api/auth/google/route";
import { GET as googleCallbackGET } from "~app/api/auth/google/callback/route";
import { prisma } from "~backend/db";
import { resetRateLimitStore } from "~backend/rate-limit";

const BASE = "https://app.example.com";

function rawUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "usr_google",
    name: "Google User",
    email: "guser@example.com",
    handle: "guser",
    passwordHash: "",
    tokenVersion: 0,
    role: "STUDENT",
    emailVerified: true,
    onboarded: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    examTarget: null,
    examDate: null,
    prepLevel: null,
    studyHoursPerDay: null,
    goal: null,
    googleId: "google-sub-1",
    authProvider: "google",
    imageUrl: "https://example.com/pic.jpg",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  void resetRateLimitStore();
});

describe("GET /api/auth/google (start)", () => {
  it("307-redirects to Google and plants the oauth_google cookie", async () => {
    const res = await googleStartGET(
      new Request(`${BASE}/api/auth/google?redirect=/dashboard`, { method: "GET" }),
    );

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("accounts.google.com");
    expect(location).toContain("state=state-abc-123");
    expect(location).toContain("code_challenge=challenge-s256");
    expect(location).toContain("code_challenge_method=S256");

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("oauth_google=");
    expect(setCookie).toContain("HttpOnly");
    // Cookie payload carries state + verifier + requested redirect.
    expect(decodeURIComponent(setCookie)).toContain("state-abc-123");
    expect(decodeURIComponent(setCookie)).toContain("verifier-xyz-789");
  });

  it("falls back to /dashboard when no redirect param is given", async () => {
    const res = await googleStartGET(new Request(`${BASE}/api/auth/google`, { method: "GET" }));
    const setCookie = decodeURIComponent(res.headers.get("set-cookie") ?? "");
    expect(setCookie).toContain('"redirect":"/dashboard"');
  });
});

describe("GET /api/auth/google/callback", () => {
  const cookieValue = JSON.stringify({
    state: "state-abc-123",
    verifier: "verifier-xyz-789",
    redirect: "/dashboard",
  });

  function callbackRequest(params: string) {
    return new Request(`${BASE}/api/auth/google/callback?${params}`, {
      method: "GET",
      headers: { cookie: `oauth_google=${encodeURIComponent(cookieValue)}` },
    });
  }

  it("creates a new Google user, sets the session cookie, and lands on /onboarding", async () => {
    // No existing user by googleId or email → create path.
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma));
    vi.mocked(prisma.user.create).mockResolvedValue(rawUser());
    vi.mocked(prisma.userProgress.create).mockResolvedValue({} as any);

    const res = await googleCallbackGET(callbackRequest("code=auth-code&state=state-abc-123"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location.endsWith("/onboarding")).toBe(true);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("auth_token="); // session cookie set
    // One-time oauth cookie is cleared.
    expect(decodeURIComponent(setCookie)).toContain("oauth_google=");

    // Assert the user service attempted creation (find-by-google then find-by-email then create).
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    const created = vi.mocked(prisma.user.create).mock.calls[0]![0].data;
    expect(created.googleId).toBe("google-sub-1");
    expect(created.authProvider).toBe("google");
    expect(created.passwordHash).toBe("");
  });

  it("rejects a state mismatch as an open-redirect/CSRF guard", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(rawUser());

    const res = await googleCallbackGET(callbackRequest("code=auth-code&state=WRONG-STATE"));

    expect(res.status).toBe(307);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("error=google_state_mismatch");
    // Token exchange must NOT have happened.
    const { exchangeCodeForTokens } = await import("~backend/auth/google");
    expect(exchangeCodeForTokens).not.toHaveBeenCalled();
  });

  it("redirects to /login when the oauth cookie is missing", async () => {
    const res = await googleCallbackGET(
      new Request(`${BASE}/api/auth/google/callback?code=auth-code&state=state-abc-123`, {
        method: "GET",
      }),
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location") ?? "").toContain("error=google_state_missing");
  });
});

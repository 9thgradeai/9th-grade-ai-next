// app/api/auth/google/route.ts — Begin Google OAuth 2.0 (PKCE).
//
// GET /api/auth/google[?redirect=/dashboard]
//   1. Rejects (redirect to /login) when Google OAuth is not configured.
//   2. Generates an opaque `state` + PKCE `code_verifier`, stores both (plus the
//      requested post-login `redirect`) in a short-lived, HttpOnly, SameSite=Lax
//      cookie, and 307-redirects the browser to Google's consent screen.
//
// This is a top-level browser navigation, so it intentionally does NOT apply the
// same-origin (CSRF) check used for POST endpoints — the `state` parameter and
// PKCE verifier provide the cross-site protection for the round-trip.

import { NextResponse } from "next/server";
import {
  isGoogleEnabled,
  generateOAuthState,
  generateCodeVerifier,
  sha256Base64Url,
  buildGoogleAuthUrl,
  getGoogleRedirectUri,
  isPreviewDeployment,
  getCanonicalAppOrigin,
} from "~backend/auth/google";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const OAUTH_COOKIE = "oauth_google";
const OAUTH_COOKIE_MAX_AGE = 600; // 10 minutes — enough for the consent round-trip

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const origin = new URL(request.url).origin;

    if (!isGoogleEnabled()) {
      const res = NextResponse.redirect(new URL("/login?error=google_unavailable", origin));
      applySecurityHeaders(res);
      return res;
    }

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:google"), LIMITS.googlePerMin, 60_000))) {
      const res = NextResponse.redirect(new URL("/login?error=google_rate_limited", origin));
      applySecurityHeaders(res);
      return res;
    }

    const { searchParams } = new URL(request.url);
    const redirect = searchParams.get("redirect") ?? "/dashboard";

    // Google only accepts pre-registered redirect URIs (no wildcards), so a
    // Vercel preview deployment can never complete the flow on its own host.
    // Bounce previews to the canonical host first — and ONLY previews. A bad
    // env value must never redirect production traffic to a dead host
    // (404 DEPLOYMENT_NOT_FOUND): production-like hosts always use their own
    // origin, which is where traffic demonstrably flows.
    const canonicalOrigin = getCanonicalAppOrigin(origin);
    if (isPreviewDeployment() && new URL(origin).origin !== canonicalOrigin) {
      const canonical = new URL("/api/auth/google", canonicalOrigin);
      canonical.searchParams.set("redirect", redirect);
      const hint = searchParams.get("login_hint");
      if (hint) canonical.searchParams.set("login_hint", hint);
      const res = NextResponse.redirect(canonical);
      applySecurityHeaders(res);
      return res;
    }

    const state = generateOAuthState();
    const verifier = generateCodeVerifier();
    const challenge = sha256Base64Url(verifier);
    const redirectUri = getGoogleRedirectUri(origin);

    const googleUrl = buildGoogleAuthUrl({
      state,
      codeChallenge: challenge,
      redirectUri,
      loginHint: searchParams.get("login_hint") ?? undefined,
    });

    const res = NextResponse.redirect(googleUrl);
    res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, redirect }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OAUTH_COOKIE_MAX_AGE,
    });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

// app/api/auth/apple/route.ts — Begin Apple Sign In (OIDC, response_mode=query).
//
// GET /api/auth/apple[?redirect=/dashboard]
//   1. Rejects (redirect to /login) when Apple Sign In is not configured.
//   2. Generates an opaque `state` + `nonce`, stores both (plus the requested
//      post-login `redirect`) in a short-lived, HttpOnly, SameSite=Lax cookie,
//      and 307-redirects the browser to Apple's consent screen.
//
// This is a top-level browser navigation, so it does not apply the same-origin
// (CSRF) check used for POST endpoints — the `state` parameter provides the
// cross-site protection for the round-trip.

import { NextResponse } from "next/server";
import {
  isAppleEnabled,
  generateOAuthState,
  generateNonce,
  buildAppleAuthUrl,
  getAppleRedirectUri,
} from "~backend/auth/apple";
import { toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const OAUTH_COOKIE = "oauth_apple";
const OAUTH_COOKIE_MAX_AGE = 600; // 10 minutes — enough for the consent round-trip

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const origin = new URL(request.url).origin;

    if (!isAppleEnabled()) {
      const res = NextResponse.redirect(new URL("/login?error=apple_unavailable", origin));
      applySecurityHeaders(res);
      return res;
    }

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:apple"), LIMITS.googlePerMin, 60_000))) {
      const res = NextResponse.redirect(new URL("/login?error=apple_rate_limited", origin));
      applySecurityHeaders(res);
      return res;
    }

    const { searchParams } = new URL(request.url);
    const redirect = searchParams.get("redirect") ?? "/dashboard";

    const state = generateOAuthState();
    const nonce = generateNonce();
    const redirectUri = getAppleRedirectUri(origin);

    const appleUrl = buildAppleAuthUrl({
      state,
      nonce,
      redirectUri,
      loginHint: searchParams.get("login_hint") ?? undefined,
    });

    const res = NextResponse.redirect(appleUrl);
    res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, nonce, redirect }), {
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

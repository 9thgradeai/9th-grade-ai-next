// app/api/auth/google/callback/route.ts — Google OAuth 2.0 redirect target.
//
// GET /api/auth/google/callback?code=...&state=...
//   1. Reads the `oauth_google` cookie set by /api/auth/google.
//   2. Validates `state` (CSRF) and exchanges the `code` for tokens using the
//      PKCE verifier from the cookie.
//   3. Locally verifies the Google `id_token` (issuer + audience + signature).
//   4. Finds-or-creates the user, sets the session cookie, and redirects to the
//      originally requested destination (new users land on /onboarding).
//
// Failures redirect back to /login with a safe, non-leaky error flag rather than
// returning a 5xx body, since this is reached via a browser navigation.

import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  verifyGoogleIdToken,
  getGoogleRedirectUri,
} from "~backend/auth/google";
import { findOrCreateGoogleUser } from "~backend/services/user";
import { signSession, setSessionCookie, safeRedirect } from "~backend/auth";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../../_middleware";

const OAUTH_COOKIE = "oauth_google";
const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

function readOAuthCookie(req: Request): { state: string; verifier: string; redirect: string } | null {
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(/(?:^|;\s*)oauth_google=([^;]*)/);
  if (!match) return null;
  try {
    const value = JSON.parse(decodeURIComponent(match[1])) as {
      state?: string;
      verifier?: string;
      redirect?: string;
    };
    if (!value.state || !value.verifier) return null;
    return { state: value.state, verifier: value.verifier, redirect: value.redirect ?? "/dashboard" };
  } catch {
    return null;
  }
}

function redirectToLogin(message: string, origin: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_COOKIE, "", OAUTH_COOKIE_OPTS);
  applySecurityHeaders(res);
  return res;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  const origin = new URL(request.url).origin;

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const errorParam = searchParams.get("error");

    const oauth = readOAuthCookie(request);
    if (!oauth) {
      return redirectToLogin("google_state_missing", origin);
    }

    // Always drop the one-time cookie, success or fail.
    const clearCookie = (res: NextResponse) => res.cookies.set(OAUTH_COOKIE, "", OAUTH_COOKIE_OPTS);

    if (errorParam) {
      return redirectToLogin(`google_${errorParam}`, origin);
    }
    if (!code || !stateParam) {
      const res = redirectToLogin("google_invalid", origin);
      clearCookie(res);
      return res;
    }
    if (stateParam !== oauth.state) {
      const res = redirectToLogin("google_state_mismatch", origin);
      clearCookie(res);
      return res;
    }

    const redirectUri = getGoogleRedirectUri(origin);
    const { idToken } = await exchangeCodeForTokens(code, oauth.verifier, redirectUri);
    const profile = await verifyGoogleIdToken(idToken);

    const user = await findOrCreateGoogleUser(profile);
    const token = await signSession({ email: user.email, ver: user.tokenVersion });

    // Brand-new Google users (not yet onboarded) go to onboarding; everyone else
    // to their originally requested destination (default /dashboard).
    const destination = user.onboarded ? safeRedirect(oauth.redirect) : "/onboarding";

    const res = NextResponse.redirect(new URL(destination, origin));
    await setSessionCookie(token, res);
    clearCookie(res);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    // Surface a generic flag to the login page; log details server-side only.
    if (err instanceof AppError) {
      return redirectToLogin("google_failed", origin);
    }
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

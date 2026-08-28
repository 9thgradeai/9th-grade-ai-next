// app/api/auth/apple/callback/route.ts — Apple Sign In redirect target.
//
// GET /api/auth/apple/callback?code=...&state=...&id_token=...&user=... (query)
//   1. Reads the `oauth_apple` cookie set by /api/auth/apple.
//   2. Validates `state` (CSRF) and exchanges the `code` for tokens.
//   3. Locally verifies the Apple `id_token` (issuer + audience + nonce).
//   4. Finds-or-creates the user, sets the session cookie, and redirects to the
//      originally requested destination (new users land on /onboarding).
//
// Failures redirect back to /login with a safe, non-leaky error flag rather than
// returning a 5xx body, since this is reached via a browser navigation.

import { NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  verifyAppleIdToken,
  getAppleRedirectUri,
} from "~backend/auth/apple";
import { findOrCreateAppleUser } from "~backend/services/user";
import { signSession, setSessionCookie, safeRedirect } from "~backend/auth";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../../_middleware";

const OAUTH_COOKIE = "oauth_apple";
const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 0,
};

function readOAuthCookie(req: Request): { state: string; nonce: string; redirect: string } | null {
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(/(?:^|;\s*)oauth_apple=([^;]*)/);
  if (!match) return null;
  try {
    const value = JSON.parse(decodeURIComponent(match[1])) as {
      state?: string;
      nonce?: string;
      redirect?: string;
    };
    if (!value.state || !value.nonce) return null;
    return { state: value.state, nonce: value.nonce, redirect: value.redirect ?? "/dashboard" };
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
      return redirectToLogin("apple_state_missing", origin);
    }

    const clearCookie = (res: NextResponse) => res.cookies.set(OAUTH_COOKIE, "", OAUTH_COOKIE_OPTS);

    if (errorParam) {
      return redirectToLogin(`apple_${errorParam}`, origin);
    }
    if (!code || !stateParam) {
      const res = redirectToLogin("apple_invalid", origin);
      clearCookie(res);
      return res;
    }
    if (stateParam !== oauth.state) {
      const res = redirectToLogin("apple_state_mismatch", origin);
      clearCookie(res);
      return res;
    }

    const redirectUri = getAppleRedirectUri(origin);
    // With response_mode=query, Apple returns the id_token directly; we still
    // exchange the code so the flow stays consistent and revocable.
    const { idToken: exchangedIdToken } = await exchangeCodeForTokens(code, redirectUri);
    const profile = await verifyAppleIdToken(exchangedIdToken, oauth.nonce);

    const user = await findOrCreateAppleUser(profile);
    const token = await signSession({ email: user.email, ver: user.tokenVersion });

    const destination = user.onboarded ? safeRedirect(oauth.redirect) : "/onboarding";

    const res = NextResponse.redirect(new URL(destination, origin));
    await setSessionCookie(token, res);
    clearCookie(res);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    if (err instanceof AppError) {
      return redirectToLogin("apple_failed", origin);
    }
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

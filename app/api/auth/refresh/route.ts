import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { signSession, verifySession, setSessionCookie, extractSessionToken, SESSION_DURATION_MS, REMEMBER_SESSION_MS } from "~backend/auth";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

// Phase 9 hardening: sliding refreshes used to extend sessions forever.
// The ORIGINAL issue time (preserved across refreshes) caps total lifetime,
// so a stolen cookie cannot be renewed indefinitely. Both bounds live in
// backend/auth.ts (SESSION_DURATION_MS / REMEMBER_SESSION_MS) so login,
// register, and refresh can never drift apart.

// Re-issues the session JWT (stateless) so the auth_token cookie expiry is
// extended while the user is active — but never beyond the absolute lifetime
// measured from the very first issue. Returns the remaining lifetime in ms.
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:refresh"), LIMITS.refreshPerMin, 60_000))) {
      throw new AppError(429, "Too many refresh attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const token = extractSessionToken(request);
    if (!token) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    const payload = await verifySession(token);
    if (!payload?.email || typeof payload.email !== "string") {
      throw new AppError(401, "Session expired. Please sign in again.", "AUTH_UNAUTHORIZED");
    }

    // Absolute-lifetime enforcement (Phase 9): iat of the CURRENT token equals
    // the original issue because refresh re-signs with setIssuedAt at each hop…
    // so we track age via the earliest claim we can trust: if this token was
    // itself minted by refresh it carries `origIat`; fresh logins start the
    // clock anew.
    const origIat =
      typeof (payload as { origIat?: unknown }).origIat === "number"
        ? ((payload as { origIat: number }).origIat)
        : typeof payload.iat === "number"
          ? payload.iat
          : 0;
    if (!origIat || Date.now() - origIat * 1000 > REMEMBER_SESSION_MS) {
      throw new AppError(401, "Session expired. Please sign in again.", "AUTH_UNAUTHORIZED");
    }

    // Re-validate the user still exists before extending the session.
    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      throw new AppError(401, "Account no longer exists.", "AUTH_UNAUTHORIZED");
    }

    // Reject tokens minted before a password change / revoke-all even though
    // the signature is still valid — their `ver` is stale. Legacy tokens
    // without the claim count as version 0.
    const tokenVer =
      typeof (payload as { ver?: unknown }).ver === "number"
        ? ((payload as { ver: number }).ver)
        : 0;
    if (tokenVer !== user.tokenVersion) {
      log.warn("auth.refresh.session_revoked", { requestId, userId: user.id });
      throw new AppError(401, "Session expired. Please sign in again.", "AUTH_SESSION_REVOKED");
    }

    // Cap the renewed token at the absolute lifetime end so a refresh near
    // the cap cannot mint validity past it (previously a flat 7d re-sign
    // could overshoot the absolute cap by days).
    const absoluteEndMs = origIat * 1000 + REMEMBER_SESSION_MS;
    const lifetimeMs = Math.max(60_000, Math.min(SESSION_DURATION_MS, absoluteEndMs - Date.now()));
    const freshToken = await signSession(
      { email: payload.email, origIat, ver: user.tokenVersion },
      new Date(Date.now() + lifetimeMs),
    );
    const res = NextResponse.json({ expiresIn: lifetimeMs, user });
    await setSessionCookie(freshToken, res, Math.floor(lifetimeMs / 1000));

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
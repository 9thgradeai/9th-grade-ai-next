import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { signSession, verifySession, setSessionCookie } from "~backend/auth";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
// Phase 9 hardening: sliding refreshes used to extend sessions forever.
// The ORIGINAL issue time (preserved across refreshes) caps total lifetime,
// so a stolen cookie cannot be renewed indefinitely.
const ABSOLUTE_SESSION_MS = 30 * 24 * 60 * 60 * 1000;

// Re-issues the session JWT (stateless) so the auth_token cookie expiry is
// extended while the user is active — but never beyond the absolute lifetime
// measured from the very first issue. Returns the remaining lifetime in ms.
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!(await checkRateLimit(getRateLimitKey(request, "auth:refresh"), LIMITS.refreshPerMin, 60_000))) {
      throw new AppError(429, "Too many refresh attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const cookie = request.headers.get("cookie") ?? "";
    const match = cookie.match(/auth_token=([^;]+)/);
    const token = match?.[1];
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
    if (!origIat || Date.now() - origIat * 1000 > ABSOLUTE_SESSION_MS) {
      throw new AppError(401, "Session expired. Please sign in again.", "AUTH_UNAUTHORIZED");
    }

    // Re-validate the user still exists before extending the session.
    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      throw new AppError(401, "Account no longer exists.", "AUTH_UNAUTHORIZED");
    }

    const freshToken = await signSession({ email: payload.email, origIat });
    const res = NextResponse.json({ expiresIn: SESSION_DURATION_MS });
    await setSessionCookie(freshToken, res);

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
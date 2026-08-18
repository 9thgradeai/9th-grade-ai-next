import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { signSession, verifySession, setSessionCookie } from "~backend/auth";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// Re-issues the session JWT (stateless) so the auth_token cookie expiry is
// extended while the user is active. Returns the remaining lifetime in ms.
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!checkRateLimit(getRateLimitKey(request, "auth:refresh"), 20, 60_000)) {
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

    // Re-validate the user still exists before extending the session.
    const user = await prisma.user.findUnique({ where: { email: payload.email } });
    if (!user) {
      throw new AppError(401, "Account no longer exists.", "AUTH_UNAUTHORIZED");
    }

    const freshToken = await signSession({ email: payload.email });
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
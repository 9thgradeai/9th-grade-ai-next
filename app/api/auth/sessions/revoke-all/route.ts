import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest, revokeAllSessions } from "~backend/services/user";
import { clearSessionCookie } from "~backend/auth";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

/**
 * POST /api/auth/sessions/revoke-all — "log out everywhere".
 * Bumps the user's tokenVersion so every issued JWT becomes invalid
 * (including this device), then clears the local session cookie.
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    await revokeAllSessions(userId);

    const res = NextResponse.json({ success: true });
    await clearSessionCookie(res);

    log.info("auth.sessions.revoked_all", { requestId, userId });

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

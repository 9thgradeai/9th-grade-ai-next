import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { validateChangePasswordInput } from "~backend/validation";
import { changeUserPassword } from "~backend/services/user";
import { getSessionUser, signSession, setSessionCookie } from "~backend/auth";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:change-password"), LIMITS.passwordPerMin, 60_000))) {
      throw new AppError(429, "Too many attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = await validateChangePasswordInput(body);

    // Bumps tokenVersion — every other device's session dies here.
    const { tokenVersion } = await changeUserPassword(
      sessionUser.id,
      currentPassword,
      newPassword,
    );

    // Re-mint THIS device's cookie with the new version so the active tab
    // stays signed in; all other sessions are now invalid.
    const token = await signSession({ email: sessionUser.email, ver: tokenVersion });
    const res = NextResponse.json({ success: true });
    await setSessionCookie(token, res);

    log.info("auth.password.changed", { requestId, userId: sessionUser.id });

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
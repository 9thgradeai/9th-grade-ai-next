import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { validateChangePasswordInput } from "~backend/validation";
import { getUserIdFromRequest, changeUserPassword } from "~backend/services/user";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!(await checkRateLimit(getRateLimitKey(request, "auth:change-password"), LIMITS.passwordPerMin, 60_000))) {
      throw new AppError(429, "Too many attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    const body = await request.json().catch(() => ({}));
    const { currentPassword, newPassword } = validateChangePasswordInput(body);

    await changeUserPassword(userId, currentPassword, newPassword);

    const res = NextResponse.json({ success: true });
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
import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { resetPassword } from "~backend/services/user";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, applyCorsHeaders, assertSameOrigin } from "../../_middleware";
import { validateResetPasswordInput } from "~backend/validation";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:reset"), LIMITS.passwordPerMin, 60_000))) {
      throw new AppError(429, "Too many requests. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => {
      throw new AppError(400, "Invalid request body.", "INVALID_BODY");
    });
    const { token, password } = await validateResetPasswordInput(body);

    await resetPassword(token, password);

    const res = NextResponse.json({ ok: true });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);
    return res;
  }
}

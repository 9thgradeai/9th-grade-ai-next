// app/api/auth/resend-verification/route.ts — Re-issue a verification email.
//
// POST /api/auth/resend-verification  { email }
//   200 { ok: true } even when the email is unknown / already verified, so the
//   endpoint cannot be used to enumerate registered accounts.

import { NextResponse } from "next/server";
import { resendVerification } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:resend"), LIMITS.passwordPerMin, 60_000))) {
      throw new AppError(429, "Too many requests. Please wait a moment.", "RATE_LIMIT_EXCEEDED");
    }

    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const origin = new URL(request.url).origin;
    const { ok, devLink, autoVerified } = await resendVerification(body.email ?? "", origin);

    const res = NextResponse.json(
      devLink ? { ok, devLink } : autoVerified ? { ok, autoVerified } : { ok },
    );
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

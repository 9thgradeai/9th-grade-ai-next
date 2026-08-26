import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { requestPasswordReset } from "~backend/services/user";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!(await checkRateLimit(getRateLimitKey(request, "auth:forgot"), 10, 60_000))) {
      throw new AppError(429, "Too many requests. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) {
      throw new AppError(400, "A valid email is required.", "INVALID_EMAIL");
    }

    // Always resolves positively — the response must not reveal whether the
    // address is registered (anti-enumeration).
    const origin = new URL(request.url).origin;
    const { devLink } = await requestPasswordReset(email, origin);

    const res = NextResponse.json({ ok: true, ...(devLink ? { devLink } : {}) });
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

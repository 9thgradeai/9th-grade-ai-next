import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { requestPasswordReset } from "~backend/services/user";
import { assertAccountAllowed } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    // Per-IP + per-account buckets: rotating IPs must not spam one mailbox.
    await assertAccountAllowed(request, "auth:forgot", email || "invalid", 10, 60_000);
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

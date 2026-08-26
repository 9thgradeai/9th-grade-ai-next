import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { validateRegisterInput } from "~backend/validation";
import { findUserByEmail, createUser } from "~backend/services/user";
import { signSession, setSessionCookie } from "~backend/auth";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:register"), LIMITS.registerPerMin, 60_000))) {
      throw new AppError(429, "Too many registration attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    // Phase 7: single source of truth — the shared validator enforces the same
    // rules here as everywhere else (name >=2, valid email, password >=8) and
    // rejects unknown fields.
    const { name, email, password } = validateRegisterInput(body);

    const existing = await findUserByEmail(email);
    if (existing) {
      throw new AppError(409, "A user with that email already exists.", "USER_EMAIL_EXISTS");
    }

    const origin = new URL(request.url).origin;
    await createUser({ name, email, password, origin });

    const newUser = await findUserByEmail(email);
    if (!newUser) {
      throw new AppError(500, "Failed to retrieve created user.", "INTERNAL_ERROR");
    }
    const token = await signSession({ email, ver: newUser.tokenVersion });
    const { passwordHash: _passwordHash, ...safeUser } = newUser;

    const res = NextResponse.json({ user: safeUser }, { status: 201 });
    await setSessionCookie(token, res);

    log.info("auth.register.success", { requestId, userId: newUser.id });

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

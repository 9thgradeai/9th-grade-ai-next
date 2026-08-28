import { NextResponse } from "next/server";
import { validateLoginInput } from "~backend/validation";
import { AppError, toHttpResponse } from "~backend/errors";
import { findUserByEmail, verifyPassword, DUMMY_PASSWORD_HASH } from "~backend/services/user";
import { signSession, setSessionCookie } from "~backend/auth";
import { assertLoginAllowed } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const body = await request.json().catch(() => ({}));
    // `remember` is an explicit, optional opt-in (default: session-length cookie).
    const remember = body?.remember === true;
    const { email, password } = validateLoginInput(body);

    // Phase 8: per-IP minute bucket + per-account hourly bucket (hashed email),
    // so rotating IPs cannot brute-force one mailbox.
    await assertLoginAllowed(request, email);

    const user = await findUserByEmail(email);

    // Social-only accounts (Google/Apple) have no password; tell the user which
    // provider to use instead of a generic "invalid credentials" so they're not
    // stuck guessing.
    if (user && user.passwordHash === "") {
      const provider = user.authProvider === "apple" ? "Apple" : "Google";
      throw new AppError(
        401,
        `This account uses ${provider} sign-in. Please choose 'Continue with ${provider}'.`,
        "AUTH_SOCIAL_ONLY",
      );
    }

    // Single bcrypt compare on BOTH paths (existing vs. unknown email) so the
    // response latency cannot reveal whether an address is registered.
    const match = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
    if (!user || !match) {
      throw new AppError(401, "Invalid email or password.", "AUTH_INVALID_CREDENTIALS");
    }

    const token = await signSession({ email: user.email, ver: user.tokenVersion });
    const { passwordHash: _passwordHash, ...safeUser } = user;
    const res = NextResponse.json({ user: safeUser });
    // "Stay signed in" extends the cookie from 7 to 30 days; otherwise the
    // session expires when the browser closes-ish (7-day cap in either case).
    await setSessionCookie(token, res, remember ? 60 * 60 * 24 * 30 : undefined);

    log.info("auth.login.success", { requestId, userId: user.id });

    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);

    return res;
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) {
      log.warn("auth.login.failed", { requestId });
    }
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

import { NextResponse } from "next/server";
import { validateLoginInput } from "~backend/validation";
import { AppError, toHttpResponse } from "~backend/errors";
import { findUserByEmail, verifyPassword, DUMMY_PASSWORD_HASH } from "~backend/services/user";
import { signSession, setSessionCookie, addUserSession, SESSION_DURATION_MS, REMEMBER_SESSION_MS } from "~backend/auth";
import { assertLoginAllowed } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders, applyCorsHeaders, assertSameOrigin } from "../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const body = await request.json().catch(() => {
      throw new AppError(400, "Invalid request body.", "INVALID_BODY");
    });
    const { email, password, remember } = validateLoginInput(body);

    // Phase 8: per-IP minute bucket + per-account hourly bucket (hashed email),
    // so rotating IPs cannot brute-force one mailbox.
    await assertLoginAllowed(request, email);

    const user = await findUserByEmail(email);

    // Social-only accounts (Google) have no password; tell the user which
    // provider to use instead of a generic "invalid credentials" so they're not
    // stuck guessing.
    if (user && user.passwordHash === "") {
      throw new AppError(
        401,
        "This account uses Google sign-in. Please choose 'Continue with Google'.",
        "AUTH_SOCIAL_ONLY",
      );
    }

    // Single bcrypt compare on BOTH paths (existing vs. unknown email) so the
    // response latency cannot reveal whether an address is registered.
    const match = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);
    if (!user || !match) {
      log.warn("auth.login.failed", { requestId });
      throw new AppError(401, "Invalid email or password.", "AUTH_INVALID_CREDENTIALS");
    }

    // Create session with unique ID for concurrency tracking
    const sessionId = crypto.randomUUID();
    // Client-controlled leftmost x-forwarded-for entries are spoofable; the
    // last entry is appended by our proxy. Informational only (session list).
    const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
    const sessionMeta = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      userAgent: request.headers.get("user-agent") ?? undefined,
      ip: (forwarded && forwarded[forwarded.length - 1]) ?? undefined,
    };

    // "Stay signed in" extends JWT + cookie + client scheduler from 7 to 30
    // days together — previously the cookie said 30d while the JWT said 7d.
    const sessionMs = remember ? REMEMBER_SESSION_MS : SESSION_DURATION_MS;
    const token = await signSession(
      { email: user.email, ver: user.tokenVersion, sid: sessionId },
      Math.floor(sessionMs / 1000),
    );
    await addUserSession(user.id, sessionMeta);

    const { passwordHash: _passwordHash, ...safeUser } = user;
    const res = NextResponse.json({ user: safeUser, expiresIn: sessionMs });
    await setSessionCookie(token, res, Math.floor(sessionMs / 1000));

    log.info("auth.login.success", { requestId, userId: user.id });

    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);

    return res;
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 401) {
      log.warn("auth.login.failed", { requestId });
    }
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);
    return res;
  }
}

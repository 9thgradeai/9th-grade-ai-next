import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { findUserByEmail, createUser } from "~backend/services/user";
import { signSession, setSessionCookie } from "~backend/auth";
import { checkRateLimit, getRateLimitKey } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    if (!checkRateLimit(getRateLimitKey(request, "auth:register"), 3, 60_000)) {
      throw new AppError(429, "Too many registration attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => ({}));
    const { name = "", email = "", password = "" } = body;

    if (typeof name !== "string" || name.trim().length < 2) {
      throw new AppError(400, "Name must be at least 2 characters.", "VALIDATION_ERROR");
    }

    if (typeof email !== "string" || !email.includes("@")) {
      throw new AppError(400, "A valid email address is required.", "VALIDATION_ERROR");
    }

    if (typeof password !== "string" || password.length < 8) {
      throw new AppError(400, "Password must be at least 8 characters.", "VALIDATION_ERROR");
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      throw new AppError(409, "A user with that email already exists.", "USER_EMAIL_EXISTS");
    }

    await createUser({ name: name.trim(), email: email.trim(), password });

    const token = await signSession({ email: email.trim() });
    const newUser = await findUserByEmail(email.trim());
    if (!newUser) {
      throw new AppError(500, "Failed to retrieve created user.", "INTERNAL_ERROR");
    }
    const { passwordHash: _passwordHash, ...safeUser } = newUser;

    const res = NextResponse.json({ user: safeUser }, { status: 201 });
    await setSessionCookie(token, res);

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

import { NextResponse } from "next/server";
import { validateLoginInput } from "~backend/validation";
import { AppError, toHttpResponse } from "~backend/errors";
import { findUserByEmail, verifyPassword } from "~backend/services/user";
import { signSession, setSessionCookie } from "~backend/auth";
import { assertLoginAllowed } from "~backend/rate-limit";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const body = await request.json().catch(() => ({}));
    const { email, password } = validateLoginInput(body);

    // Phase 8: per-IP minute bucket + per-account hourly bucket (hashed email),
    // so rotating IPs cannot brute-force one mailbox.
    await assertLoginAllowed(request, email);

    const user = await findUserByEmail(email);
    if (!user) {
      throw new AppError(401, "Invalid email or password.", "AUTH_INVALID_CREDENTIALS");
    }

    const match = await verifyPassword(user.passwordHash, password);
    if (!match) {
      throw new AppError(401, "Invalid email or password.", "AUTH_INVALID_CREDENTIALS");
    }

    const token = await signSession({ email: user.email });
    const { passwordHash: _passwordHash, ...safeUser } = user;
    const res = NextResponse.json({ user: safeUser });
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

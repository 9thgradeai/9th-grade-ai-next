import { NextResponse } from "next/server";
import { AppError } from "~backend/errors";
import { validateRegisterInput } from "~backend/validation";
import { findUserByEmail, createUser } from "~backend/services/user";
import { signSession, setSessionCookie, SESSION_DURATION_MS } from "~backend/auth";
import { checkRateLimit, getRateLimitKey, LIMITS } from "~backend/rate-limit";
import { assertSameOrigin, withHandler } from "../../_middleware";
import { log } from "~backend/infrastructure/observability/logger";

export const POST = withHandler(
  async (request: Request, { requestId }) => {
    assertSameOrigin(request);

    if (!(await checkRateLimit(getRateLimitKey(request, "auth:register"), LIMITS.registerPerMin, 60_000))) {
      throw new AppError(429, "Too many registration attempts. Please try again later.", "RATE_LIMIT_EXCEEDED");
    }

    const body = await request.json().catch(() => {
      throw new AppError(400, "Invalid request body.", "INVALID_BODY");
    });
    // Phase 7: single source of truth — the shared validator enforces the same
    // rules here as everywhere else (name >=2, valid email, password >=8) and
    // rejects unknown fields. Now includes zxcvbn + HIBP password strength check.
    const { name, email, password } = await validateRegisterInput(body);

    const existing = await findUserByEmail(email);
    if (existing) {
      throw new AppError(409, "A user with that email already exists.", "USER_EMAIL_EXISTS");
    }

    const origin = new URL(request.url).origin;
    // createUser already returns the full UserRecord — no second lookup needed.
    const newUser = await createUser({ name, email, password, origin });
    const token = await signSession({ email, ver: newUser.tokenVersion });

    const res = NextResponse.json({ user: newUser, expiresIn: SESSION_DURATION_MS }, { status: 201 });
    await setSessionCookie(token, res);

    log.info("auth.register.success", { requestId, userId: newUser.id });

    return res;
  },
  { cors: true },
);

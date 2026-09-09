import { NextResponse } from "next/server";
import { AppError, UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest, completeOnboarding } from "~backend/services/user";
import { getRequestId, startTiming, applySecurityHeaders, applyCorsHeaders, assertSameOrigin } from "../_middleware";
import { validateOnboardingInput } from "~backend/validation";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json().catch(() => {
      throw new AppError(400, "Invalid request body.", "INVALID_BODY");
    });
    const onboardingInput = await validateOnboardingInput(body);

    const user = await completeOnboarding(userId, onboardingInput);
    const { passwordHash: _passwordHash, ...safeUser } = user;

    const res = NextResponse.json({ ok: true, user: safeUser });
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

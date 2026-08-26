import { NextResponse } from "next/server";
import { AppError, UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest, completeOnboarding } from "~backend/services/user";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Authentication required");
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body !== "object" || body === null) {
      throw new AppError(400, "Invalid request body.", "INVALID_BODY");
    }

    const user = await completeOnboarding(userId, body);
    const { passwordHash: _passwordHash, ...safeUser } = user;

    const res = NextResponse.json({ ok: true, user: safeUser });
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

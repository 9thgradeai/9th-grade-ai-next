import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { validateUpdateProfileInput } from "~backend/validation";
import { getUserIdFromRequest, updateUserProfile } from "~backend/services/user";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    const body = await request.json().catch(() => ({}));
    const input = validateUpdateProfileInput(body);

    const updated = await updateUserProfile(userId, input);
    const { passwordHash: _passwordHash, ...safeUser } = updated;

    const res = NextResponse.json({ user: safeUser });
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
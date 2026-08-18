import { NextResponse } from "next/server";
import { getSessionUser } from "~backend/auth";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const user = await getSessionUser(request);
    if (!user) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
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

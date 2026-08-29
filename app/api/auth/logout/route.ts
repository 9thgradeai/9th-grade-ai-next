import { NextResponse } from "next/server";
import { clearSessionCookie, removeUserSession, getSessionUser, verifySession } from "~backend/auth";
import { toHttpResponse } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    // Get session user to find session ID
    const sessionUser = await getSessionUser(request);
    const token = request.headers.get("cookie")?.match(/auth_token=([^;]+)/)?.[1];
    let sessionId: string | null = null;
    if (token) {
      const payload = await verifySession(token);
      sessionId = typeof (payload as { sid?: unknown })?.sid === "string"
        ? (payload as { sid: string }).sid
        : null;
    }

    if (sessionUser && sessionId) {
      await removeUserSession(sessionUser.id, sessionId);
    }

    const res = NextResponse.json({ success: true });
    await clearSessionCookie(res);
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

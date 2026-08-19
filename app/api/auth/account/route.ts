import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest, deleteUserAccount } from "~backend/services/user";
import { clearSessionCookie } from "~backend/auth";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function DELETE(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    await deleteUserAccount(userId);

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
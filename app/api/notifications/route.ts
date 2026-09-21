import { NextResponse } from "next/server";
import { getNotifications, getUnreadCount } from "~backend/services/notification";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const { searchParams } = new URL(request.url);
    const limit = searchParams.has("limit")
      ? Math.min(50, Math.max(1, parseInt(searchParams.get("limit")!, 10)))
      : 20;
    const cursor = searchParams.has("cursor")
      ? parseInt(searchParams.get("cursor")!, 10)
      : undefined;
    const type = searchParams.get("type") ?? undefined;

    const { items, nextCursor, total } = await getNotifications(userId, { limit, cursorId: cursor });
    const filtered = type ? items.filter((n) => n.type === type) : items;
    const unreadCount = await getUnreadCount(userId);

    const res = NextResponse.json({
      notifications: filtered,
      total,
      nextCursor,
      unreadCount,
    });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { public: false, maxAge: 0 });
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

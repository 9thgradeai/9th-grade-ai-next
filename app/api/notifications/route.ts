import { NextResponse } from "next/server";
import { getNotifications } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { validateBoundedInt } from "~backend/validation";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const { searchParams } = new URL(request.url);
    // Keyset pagination (Phase 6) with shared validation (Phase 7): `limit`
    // bounds each page (1–50); `cursor` is the previous page's nextCursor.
    const limit = validateBoundedInt(
      searchParams.has("limit") ? Number(searchParams.get("limit")) : undefined,
      "limit",
      { min: 1, max: 50, default: 20 },
    ) as number;
    const rawCursor = searchParams.has("cursor") ? Number(searchParams.get("cursor")) : undefined;
    const cursorId = validateBoundedInt(rawCursor, "cursor", { min: 1 });

    const { items, nextCursor, total } = await getNotifications(userId, { limit, cursorId });

    const res = NextResponse.json({
      notifications: items,
      pageSize: limit,
      total,
      nextCursor,
    });
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

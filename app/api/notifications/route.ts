import { NextResponse } from "next/server";
import { getNotifications } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
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
    const rawPage = searchParams.get("page");
    const rawLimit = searchParams.get("limit");
    const parsedPage = Number(rawPage);
    const parsedLimit = Number(rawLimit);
    const page = rawPage && Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
    const limit = rawLimit && Number.isFinite(parsedLimit) ? Math.min(parsedLimit, 100) : 20;

    const all = await getNotifications(userId);
    const start = (page - 1) * limit;
    const paginated = all.slice(start, start + limit);

    const res = NextResponse.json({
      notifications: paginated,
      page,
      pageSize: limit,
      total: all.length,
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

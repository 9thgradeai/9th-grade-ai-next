// GET /api/badges — list achievement badges with the caller's unlock state.
// Thin delegate: data access lives in backend/services/content.ts (Phase 4).
import { NextResponse } from "next/server";
import { getBadgeCatalog } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    // Optional auth — anonymous callers get the catalog with seed flags.
    const userId = await getUserIdFromRequest(request).catch(() => null);
    const badges = await getBadgeCatalog(userId);

    const res = NextResponse.json({ badges });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    if (!userId) {
      applyCacheHeaders(res, { public: true, maxAge: 300, staleWhileRevalidate: 600 });
    } else {
      applyCacheHeaders(res, { public: false, maxAge: 0 });
    }
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

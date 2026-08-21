// GET /api/badges — list achievement badges.
// Thin delegate: data access lives in backend/services/content.ts (Phase 4).
import { NextResponse } from "next/server";
import { getBadgeCatalog } from "~backend/services/content";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const badges = await getBadgeCatalog();
    const res = NextResponse.json({ badges });
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

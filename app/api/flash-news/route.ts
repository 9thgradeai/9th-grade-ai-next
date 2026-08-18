import { NextResponse } from "next/server";
import { getFlashNews } from "~backend/services/content";
import { getRequestId, startTiming, applyCacheHeaders, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const news = await getFlashNews();
    const res = NextResponse.json({ news });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { maxAge: 300, public: true });
    applySecurityHeaders(res);
    return res;
  } catch {
    const res = NextResponse.json(
      { error: { message: "Failed to fetch flash news.", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

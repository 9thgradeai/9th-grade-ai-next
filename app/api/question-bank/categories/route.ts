import { NextResponse } from "next/server";
import { getQuestionBankCategories } from "~backend/services/content";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const categories = await getQuestionBankCategories();

    const res = NextResponse.json({ categories });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    // Shared reference data — safe to cache briefly at the edge/browser.
    applyCacheHeaders(res, { public: true, maxAge: 300, staleWhileRevalidate: 600 });
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

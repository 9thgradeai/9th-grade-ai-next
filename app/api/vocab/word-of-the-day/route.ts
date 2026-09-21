import { NextResponse } from "next/server";
import { getWordOfDay, getWeeklyWords } from "~backend/services/word-of-the-day";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const { searchParams } = new URL(request.url);
    const weekly = searchParams.get("weekly") === "true";
    const userId = await getUserIdFromRequest(request);
    if (weekly) {
      const words = await getWeeklyWords(userId ?? undefined);
      const res = NextResponse.json({ words });
      res.headers.set("X-Request-Id", requestId);
      res.headers.set("X-Response-Time", getTime() + "ms");
      applyCacheHeaders(res, { public: false, maxAge: 0 });
      applySecurityHeaders(res);
      return res;
    }
    const word = await getWordOfDay(userId ?? undefined);
    const res = NextResponse.json({ word });
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

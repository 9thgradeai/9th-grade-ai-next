import { NextResponse } from "next/server";
import { getVocabStats } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const stats = await getVocabStats(userId);
    const res = NextResponse.json(stats);
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

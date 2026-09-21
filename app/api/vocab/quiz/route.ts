import { NextResponse } from "next/server";
import { getVocabQuizWords } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    const { searchParams } = new URL(request.url);
    const count = searchParams.get("count") ? Math.min(50, Math.max(4, parseInt(searchParams.get("count")!, 10))) : undefined;
    const difficulty = searchParams.get("difficulty") ?? undefined;
    const words = await getVocabQuizWords(userId, { count, difficulty });
    const res = NextResponse.json({ words });
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

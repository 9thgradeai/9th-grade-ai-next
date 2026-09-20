import { NextResponse } from "next/server";
import { getVocabWords } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : undefined;
    const exam = searchParams.get("exam") ?? undefined;
    const difficulty = searchParams.get("difficulty") ?? undefined;
    const userId = await getUserIdFromRequest(request);
    const words = await getVocabWords(userId ?? undefined, { limit, exam, difficulty });
    const res = NextResponse.json({ words });
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

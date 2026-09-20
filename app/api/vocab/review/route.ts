import { NextResponse } from "next/server";
import { reviewVocabWord } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { wordId, correct } = body;
    if (!wordId || typeof correct !== "boolean") return NextResponse.json({ error: "wordId and correct required" }, { status: 400 });
    const result = await reviewVocabWord(userId, Number(wordId), Boolean(correct));
    const res = NextResponse.json(result);
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

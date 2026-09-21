import { NextResponse } from "next/server";
import { reviewVocabWord } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    const body = await request.json();
    const { wordId, correct } = body;
    if (!wordId || typeof correct !== "boolean") throw new AppError(400, "wordId and correct required", "VALIDATION_ERROR");
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

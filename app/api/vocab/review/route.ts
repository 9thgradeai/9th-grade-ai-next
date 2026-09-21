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
    const { wordId, rating, correct } = body;
    if (!wordId) throw new AppError(400, "wordId is required", "VALIDATION_ERROR");
    // Support both new 4-rating (1-4) and legacy boolean
    const numRating = typeof rating === "number" ? Math.round(rating) : typeof correct === "boolean" ? (correct ? 3 : 1) : undefined;
    if (numRating === undefined || numRating < 1 || numRating > 4) throw new AppError(400, "rating (1-4) or correct (boolean) is required", "VALIDATION_ERROR");
    const result = await reviewVocabWord(userId, Number(wordId), numRating);
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

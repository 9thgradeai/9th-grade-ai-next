import { NextResponse } from "next/server";
import { getVocabDailyProgress, setVocabDailyGoal } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  applyCacheHeaders,
  assertSameOrigin,
} from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    const daily = await getVocabDailyProgress(userId);
    const res = NextResponse.json(daily);
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

/** Save the caller's manual daily-word target. Null clears it back to adaptive. */
export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    const body = await request.json();
    const raw = body?.goal;
    if (raw !== null && (typeof raw !== "number" || !Number.isFinite(raw))) {
      throw new AppError(400, "goal must be a number or null", "VALIDATION_ERROR");
    }
    const result = raw === null
      ? await setVocabDailyGoal(userId, null) // cleared: recompute from due count
      : await setVocabDailyGoal(userId, Math.round(raw as number));
    const res = NextResponse.json(result);
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

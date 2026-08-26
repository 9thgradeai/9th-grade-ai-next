import { NextResponse } from "next/server";
import { getDailyQuiz } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    // Optional auth: anonymous callers receive neutral flags; authenticated
    // callers receive their own participation state (Phase 2).
    const userId = await getUserIdFromRequest(request);
    const quiz = await getDailyQuiz(userId);

    const res = NextResponse.json({ quiz });
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

import { NextResponse } from "next/server";
import { getPreparationIntelligence } from "~backend/services/preparation-intelligence";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

// Unifies every dashboard analytics call into ONE authenticated, server-side
// aggregation. Home + Progress render from this single payload so they can
// never disagree on a metric. Response is intentionally NOT cached: the
// dashboard must reflect the very last practice/exam/mistake action.
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const intelligence = await getPreparationIntelligence(userId);

    const res = NextResponse.json({ intelligence });
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
/* GET /api/ai/opening — personalized AI-workspace opening (greeting, honest
   summary, deterministic insights and data-backed starter prompts).
   Authenticated; no LLM cost, so no AI quota is consumed here. */

import { NextResponse } from "next/server";
import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { getAIOpening } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();

    const opening = await getAIOpening(userId);

    const res = NextResponse.json({ opening });
    res.headers.set("Cache-Control", "no-store");
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
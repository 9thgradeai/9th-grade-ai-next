/* POST /api/ai/assistant — the learner's intelligent study companion.
   Authenticated. Uses real learning context (progress, weak topics, activity)
   and returns guidance + suggested next-best actions. */

import { RateLimitError, UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { checkRateLimit, checkDailyQuota, getRateLimitKey } from "~backend/rate-limit";
import { assistantTurn } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

const MINUTE_MAX = 10;
const MINUTE_WINDOW_MS = 60_000;
const DAILY_MAX = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use the AI assistant.");
    }

    if (!checkRateLimit(getRateLimitKey(request, "ai:assistant", userId), MINUTE_MAX, MINUTE_WINDOW_MS)) {
      throw new RateLimitError("Too many AI requests. Please wait a moment.");
    }
    if (!checkDailyQuota(`ai:assistant:${userId}`, DAILY_MAX)) {
      throw new RateLimitError("Daily AI assistant limit reached. Come back tomorrow!");
    }

    const body = await request.json().catch(() => ({}));
    const { result, conversationId, provider, model } = await assistantTurn({
      userId,
      request: body,
    });

    const res = new Response(
      JSON.stringify({ ...result, conversationId }),
      {
        headers: {
          "Content-Type": "application/json",
          "X-Conversation-Id": conversationId,
          "X-AI-Source": result.source,
          "X-AI-Model": model,
          "X-Request-Id": requestId,
          "X-Response-Time": getTime() + "ms",
        },
      },
    );
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
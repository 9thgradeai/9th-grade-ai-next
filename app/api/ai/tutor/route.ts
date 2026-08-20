/* POST /api/ai/tutor — streaming AI tutor.
   Authenticated. Persists conversations. Uses the ModelRouter (Groq primary,
   Anthropic fallback, labelled mock). Real token streaming via the AI SDK. */

import { AppError, RateLimitError, UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { checkRateLimit, checkDailyQuota, getRateLimitKey } from "~backend/rate-limit";
import { createTutorTurn } from "~backend/ai";
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
      throw new UnauthorizedError("Sign in to use the AI tutor.");
    }

    if (!checkRateLimit(getRateLimitKey(request, "ai:tutor", userId), MINUTE_MAX, MINUTE_WINDOW_MS)) {
      throw new RateLimitError("Too many AI requests. Please wait a moment.");
    }
    if (!checkDailyQuota(`ai:tutor:${userId}`, DAILY_MAX)) {
      throw new RateLimitError("Daily AI tutor limit reached. Come back tomorrow!");
    }

    const body = await request.json().catch(() => ({}));
    const { stream, conversationId, intent, provider, model } = await createTutorTurn({
      userId,
      request: body,
    });

    const res = new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Conversation-Id": conversationId,
        "X-AI-Intent": intent,
        "X-AI-Source": provider,
        "X-AI-Model": model,
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
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
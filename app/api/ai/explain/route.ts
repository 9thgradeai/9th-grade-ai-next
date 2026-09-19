/* POST /api/ai/explain — detailed MCQ explanation for exam review.
   Authenticated. Delegates to the AI application layer; validates structured
   output; persists an EXPLAIN conversation for history. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { explainQuestion } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

// Streaming/LLM latency can exceed serverless defaults; keep the invocation alive.
export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use the AI explanation.");
    }

    await enforceAiQuotas(request, "solver", userId);

    const body = await request.json().catch(() => ({}));
    const { stream, conversationId, provider, model } = await explainQuestion({ userId, request: body });

    const res = new Response(stream, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Conversation-Id": conversationId,
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

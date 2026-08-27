/* POST /api/ai/evaluate — grade a learner's written answer. Authenticated. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { evaluateAnswer } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export const maxDuration = 60;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use the answer evaluator.");
    }

    await enforceAiQuotas(request, "solver", userId);

    const body = await request.json().catch(() => ({}));
    const { result, conversationId, provider, model } = await evaluateAnswer({ userId, request: body });

    const res = new Response(JSON.stringify({ ...result, conversationId }), {
      headers: {
        "Content-Type": "application/json",
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

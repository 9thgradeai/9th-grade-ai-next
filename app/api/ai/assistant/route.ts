/* POST /api/ai/assistant — the learner's intelligent study companion.
   Authenticated. Uses real learning context (progress, weak topics, activity)
   and returns guidance + suggested next-best actions. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { assistantTurn } from "~backend/ai";
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
      throw new UnauthorizedError("Sign in to use the AI assistant.");
    }

    // Phase 8: per-user minute + daily quotas (store-backed) with the usage
    // ledger as the authoritative daily backstop on single-instance stores.
    await enforceAiQuotas(request, "assistant", userId);

    const body = await request.json().catch(() => ({}));
    const { stream, conversationId, provider, model } = await assistantTurn({
      userId,
      request: body,
    });

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
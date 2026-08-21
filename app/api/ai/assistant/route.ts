/* POST /api/ai/assistant — the learner's intelligent study companion.
   Authenticated. Uses real learning context (progress, weak topics, activity)
   and returns guidance + suggested next-best actions. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { assistantTurn } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use the AI assistant.");
    }

    // Phase 8: per-user minute + daily quotas (store-backed) with the usage
    // ledger as the authoritative daily backstop on single-instance stores.
    await enforceAiQuotas(request, "assistant", userId);

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
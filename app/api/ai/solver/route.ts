/* POST /api/ai/solver — step-by-step question solver (text + optional image).
   Authenticated. Delegates to the AI application layer; validates structured
   output; persists a SOLVER conversation for history and tutor handoff. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { solveQuestion } from "~backend/ai";
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
      throw new UnauthorizedError("Sign in to use the AI solver.");
    }

    // Phase 8: per-user minute + daily quotas (store-backed) with the usage
    // ledger as the authoritative daily backstop on single-instance stores.
    await enforceAiQuotas(request, "solver", userId);

    const body = await request.json().catch(() => ({}));
    const { result, conversationId } = await solveQuestion({ userId, request: body });

    const res = new Response(
      JSON.stringify({ ...result, conversationId }),
      {
        headers: {
          "Content-Type": "application/json",
          "X-Conversation-Id": conversationId,
          "X-AI-Source": result.source,
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
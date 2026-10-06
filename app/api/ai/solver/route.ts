/* POST /api/ai/solver — step-by-step question solver (text + optional image).
   Authenticated. Delegates to the AI application layer; validates structured
   output; persists a SOLVER conversation for history and tutor handoff. */

import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { solveQuestion } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin, readJsonBody } from "../../_middleware";

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

    const body = await readJsonBody(request, 6 * 1024 * 1024);
    const { stream, conversationId, provider, model } = await solveQuestion({ userId, request: body });

    // Client disconnect stops the model stream — never burn tokens into the void.
    request.signal.addEventListener("abort", () => {
      stream.cancel().catch(() => {});
    }, { once: true });

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
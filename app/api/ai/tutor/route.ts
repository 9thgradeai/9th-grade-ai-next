/* POST /api/ai/tutor — streaming AI tutor.
   Authenticated. Persists conversations. Uses the ModelRouter (Groq primary,
   Anthropic fallback, labelled mock). Real token streaming via the AI SDK. */

import { AppError, UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { createTutorTurn } from "~backend/ai";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new UnauthorizedError("Sign in to use the AI tutor.");
    }

    // Phase 8: per-user minute + daily quotas (store-backed) with the usage
    // ledger as the authoritative daily backstop on single-instance stores.
    await enforceAiQuotas(request, "tutor", userId);

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
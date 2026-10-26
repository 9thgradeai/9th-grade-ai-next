/* POST /api/ai/explain-v2 — independent, evidence-backed MCQ verification.
 *
 * Trust boundary: the client sends only the question id, its own selection,
 * and (optionally) the display order it saw. It cannot send the answer key.
 * The stored key is read server-side by the audit stage, after the independent
 * finding exists, and is never fed back to the solver.
 */

import { AppError, UnauthorizedError, ValidationError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { enforceAiQuotas } from "~backend/rate-limit";
import { generateIndependentExplanation } from "~backend/ai/explain-engine/orchestrator";
import { ExplainV2RequestSchema } from "~backend/ai/explain-engine/schema/input";
import { isExplainV2Enabled } from "~backend/ai/explain-engine/flags";
import {
  applySecurityHeaders,
  assertSameOrigin,
  getRequestId,
  readJsonBody,
  startTiming,
} from "../../_middleware";

// Search + two model passes can exceed serverless defaults.
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

    if (!isExplainV2Enabled()) {
      throw new AppError(
        503,
        "Verified explanations are currently disabled. The standard explanation is still available.",
        "AI_EXPLAIN_V2_DISABLED",
      );
    }

    await enforceAiQuotas(request, "solver", userId);

    const body = await readJsonBody(request);
    const parsed = ExplainV2RequestSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ValidationError(
        first ? `${first.path.join(".") || "body"}: ${first.message}` : "Invalid request body.",
      );
    }

    const result = await generateIndependentExplanation(userId, parsed.data);

    const res = new Response(JSON.stringify(result), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
        "X-Response-Time": `${getTime()}ms`,
        "X-AI-Source": result.metadata?.provider ?? "unverified",
        "X-AI-Model": result.metadata?.model ?? "unknown",
        "X-AI-Verification": result.verificationStatus,
      },
    });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", `${getTime()}ms`);
    res.headers.set("Cache-Control", "no-store");
    applySecurityHeaders(res);
    return res;
  }
}

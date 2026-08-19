import { NextResponse } from "next/server";
import { patchUserProgress, getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

const PROGRESS_FIELDS = new Set([
  "points",
  "streak",
  "accuracy",
  "questionsAnswered",
  "flashcardsReviewed",
  "aiQuestionsAsked",
  "examsAttempted",
  "rank",
]);

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: Record<string, number> = {};
    for (const [key, value] of Object.entries(body)) {
      if (PROGRESS_FIELDS.has(key) && typeof value === "number" && Number.isFinite(value)) {
        patch[key] = Math.max(0, Math.round(value));
      }
    }
    if (Object.keys(patch).length === 0) {
      throw new AppError(400, "No valid progress fields provided.", "VALIDATION_ERROR");
    }
    const progress = await patchUserProgress(userId, patch);
    const res = NextResponse.json({ progress });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
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

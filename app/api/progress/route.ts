import { NextResponse } from "next/server";
import { patchUserProgress, getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { assertNoUnknownFields, validateBoundedInt } from "~backend/validation";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

// Client-writable progress fields. `streak` and `rank` are intentionally
// excluded — they are derived server-side from the attempt log and cannot be
// set by the client.
const PROGRESS_FIELDS = [
  "points",
  "accuracy",
  "questionsAnswered",
  "flashcardsReviewed",
  "aiQuestionsAsked",
  "examsAttempted",
] as const;

// Documented bounds per field (mirror DB CHECK constraints, Phase 3).
const FIELD_BOUNDS: Record<(typeof PROGRESS_FIELDS)[number], { max?: number }> = {
  points: {},
  accuracy: { max: 100 },
  questionsAnswered: {},
  flashcardsReviewed: {},
  aiQuestionsAsked: {},
  examsAttempted: {},
};

export async function PATCH(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    // Strict mode: unknown fields are REJECTED, not silently dropped.
    assertNoUnknownFields(body, PROGRESS_FIELDS);

    const patch: Record<string, number> = {};
    for (const key of PROGRESS_FIELDS) {
      const value = validateBoundedInt(body[key], key, {
        min: 0,
        ...(FIELD_BOUNDS[key].max !== undefined ? { max: FIELD_BOUNDS[key].max } : {}),
      });
      if (value !== undefined) {
        patch[key] = value;
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

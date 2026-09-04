import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse } from "~backend/errors";
import { registerExamAttempt } from "~backend/services/exam-submission";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware";

/**
 * POST /api/exam/start
 *
 * Registers a freshly built exam attempt so the subsequent /api/exam/submit
 * call has a server-side target row to upsert. Without this step, every
 * submit would create a fresh row — making idempotency impossible.
 *
 * The client mints the attemptId (UUID) and stores it alongside the local
 * exam state, then reuses it for every retry.
 *
 * Body: { attemptId: string, questionIds: number[] }
 * Returns: { attemptId: string, status: "IN_PROGRESS" }
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    await assertSubmitAllowed(userId);

    const body = (await request.json().catch(() => ({}))) as {
      attemptId?: unknown;
      questionIds?: unknown;
    };

    if (typeof body.attemptId !== "string") {
      throw new AppError(
        400,
        "attemptId (string) is required.",
        "VALIDATION_ERROR",
      );
    }
    if (
      !Array.isArray(body.questionIds) ||
      body.questionIds.some((id) => !Number.isInteger(id))
    ) {
      throw new AppError(
        400,
        "questionIds must be an array of integers.",
        "VALIDATION_ERROR",
      );
    }
    if (body.questionIds.length === 0 || body.questionIds.length > 200) {
      throw new AppError(
        400,
        "questionIds must contain 1–200 entries.",
        "VALIDATION_ERROR",
      );
    }

    await registerExamAttempt(userId, body.attemptId, body.questionIds as number[]);

    const res = NextResponse.json({
      attemptId: body.attemptId,
      status: "IN_PROGRESS" as const,
    });
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

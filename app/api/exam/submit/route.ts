import { NextResponse } from "next/server";
import {
  submitExamAttempt,
  type SubmitExamRequest,
} from "~backend/services/exam-submission";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware";

/**
 * POST /api/exam/submit
 *
 * Canonical, idempotent exam submission. Requires an `attemptId` minted by
 * /api/exam/start. Re-submits for the same (userId, attemptId) resolve to the
 * original SUBMITTED result with `outcome: "resumed"`, never double-counting
 * points or duplicating attempts.
 *
 * Body: SubmitExamRequest
 *   { attemptId, questionIds, durationSec, answers: [{ questionId, selected }] }
 *
 * Returns: ExamResultDTO
 *   { summary, review, attemptId, outcome, submittedAt }
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

    const body = (await request.json().catch(() => ({}))) as Partial<SubmitExamRequest>;
    if (!body || typeof body !== "object") {
      throw new AppError(400, "Request body must be an object.", "VALIDATION_ERROR");
    }

    const result = await submitExamAttempt(userId, {
      attemptId: typeof body.attemptId === "string" ? body.attemptId : "",
      questionIds: Array.isArray(body.questionIds)
        ? (body.questionIds.filter((id): id is number => Number.isInteger(id)))
        : [],
      durationSec: typeof body.durationSec === "number" ? body.durationSec : 0,
      answers: Array.isArray(body.answers)
        ? body.answers
            .map((a) => {
              if (
                a &&
                typeof a === "object" &&
                Number.isInteger((a as { questionId?: unknown }).questionId) &&
                typeof (a as { selected?: unknown }).selected === "string"
              ) {
                return {
                  questionId: (a as { questionId: number }).questionId,
                  selected: (a as { selected: string }).selected,
                };
              }
              return null;
            })
            .filter((a): a is { questionId: number; selected: string } => a !== null)
        : [],
    });

    const res = NextResponse.json({ result });
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

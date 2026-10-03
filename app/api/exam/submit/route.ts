import { NextResponse } from "next/server";
import {
  submitExamAttempt,
  type SubmitExamRequest,
} from "~backend/services/exam-submission";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse } from "~backend/errors";
import {
  assertNoUnknownFields,
  validateExamAnswers,
  validateExamDurationSec,
  validateExamQuestionIds,
} from "~backend/validation";
import { QueryCache } from "~backend/infrastructure/cache/query-cache";
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

    const headerKey = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key") || "";
    const body = (await request.json().catch(() => ({}))) as Partial<SubmitExamRequest>;
    if (!body || typeof body !== "object") {
      throw new AppError(400, "Request body must be an object.", "VALIDATION_ERROR");
    }
    assertNoUnknownFields(body, ["attemptId", "questionIds", "durationSec", "answers"]);
    // Idempotency-Key header is authoritative per spec; falls back to body for backward compat
    const attemptIdFromHeader = headerKey && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headerKey) ? headerKey : "";
    if (attemptIdFromHeader && typeof body.attemptId === "string" && body.attemptId !== "" && body.attemptId !== attemptIdFromHeader) {
      throw new AppError(400, "Idempotency-Key header must match body attemptId.", "VALIDATION_ERROR");
    }

    const result = await submitExamAttempt(userId, {
      attemptId: attemptIdFromHeader || (typeof body.attemptId === "string" ? body.attemptId : ""),
      // Strict contract (backend/validation.ts, shared with
      // /api/exams/[attemptId]/submit): malformed input is REJECTED with 400,
      // never silently stripped.
      questionIds: validateExamQuestionIds(body.questionIds),
      durationSec: validateExamDurationSec(body.durationSec),
      answers: validateExamAnswers(body.answers),
    });

    await QueryCache.invalidateIntelligence(userId);
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

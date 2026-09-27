import { NextResponse } from "next/server";
import {
  submitExamAttempt,
  type SubmitExamRequest,
} from "~backend/services/exam-submission";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse, ValidationError } from "~backend/errors";
import {
  assertNoUnknownFields,
  validateSubmittedAnswers,
  MAX_SUBMITTED_ANSWERS,
} from "~backend/validation";
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
      // Strict contract (backend/validation.ts): malformed input is REJECTED
      // with 400, never silently stripped. Filtering here used to mask client
      // bugs and let answer-subset drift past the questionSetHash check.
      questionIds: validateQuestionIds(body.questionIds),
      durationSec: validateDurationSec(body.durationSec),
      answers: validateAnswers(body.answers),
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

/** Every entry must be an integer id — a single malformed entry rejects the payload. */
function validateQuestionIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    throw new ValidationError("questionIds must be an array.");
  }
  if (value.length > MAX_SUBMITTED_ANSWERS) {
    throw new ValidationError(
      `questionIds must contain at most ${MAX_SUBMITTED_ANSWERS} entries.`,
    );
  }
  for (const id of value) {
    if (!Number.isInteger(id)) {
      throw new ValidationError("questionIds must all be integers.");
    }
  }
  return value as number[];
}

/** durationSec is required context for scoring analytics; no silent fallback. */
function validateDurationSec(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ValidationError("durationSec must be a non-negative integer.");
  }
  return value;
}

/** Shape-and-size check plus per-entry validation — rejects, never strips. */
function validateAnswers(value: unknown): Array<{ questionId: number; selected: string }> {
  validateSubmittedAnswers(value);
  for (const a of value) {
    if (
      !a ||
      typeof a !== "object" ||
      !Number.isInteger((a as { questionId?: unknown }).questionId) ||
      typeof (a as { selected?: unknown }).selected !== "string"
    ) {
      throw new ValidationError(
        "answers entries must be { questionId: integer, selected: string }.",
      );
    }
  }
  return value as Array<{ questionId: number; selected: string }>;
}

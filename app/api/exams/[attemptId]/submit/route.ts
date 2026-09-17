/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { submitExamAttempt, type SubmitExamRequest } from "~backend/services/exam-submission";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";

/**
 * POST /api/exams/:attemptId/submit  — canonical per spec
 * Headers: Authorization, Idempotency-Key: <UUID>
 * Body: { questionIds, durationSec, answers }
 * The attemptId is taken from the URL path and must match Idempotency-Key header if present.
 */
export async function POST(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    await assertSubmitAllowed(userId);

    const { attemptId: pathAttemptId } = await params;
    const headerKey = request.headers.get("Idempotency-Key") || request.headers.get("idempotency-key") || "";
    const body = (await request.json().catch(() => ({}))) as Partial<SubmitExamRequest> & { attemptId?: string };
    // Path param is authoritative; header must match if provided
    let attemptId = pathAttemptId;
    if (headerKey && headerKey !== pathAttemptId) {
      throw new AppError(400, "Idempotency-Key header must match URL attemptId.", "VALIDATION_ERROR");
    }
    if (body.attemptId && body.attemptId !== pathAttemptId) {
      throw new AppError(400, "Body attemptId must match URL attemptId.", "VALIDATION_ERROR");
    }
    // Fallback: if path is empty (should not), use header/body
    if (!attemptId) attemptId = headerKey || body.attemptId || "";

    const result = await submitExamAttempt(userId, {
      attemptId,
      questionIds: Array.isArray((body as any).questionIds) ? (body as any).questionIds.filter((id: unknown): id is number => Number.isInteger(id)) : [],
      durationSec: typeof (body as any).durationSec === "number" ? (body as any).durationSec : 0,
      answers: Array.isArray((body as any).answers)
        ? (body as any).answers
            .map((a: unknown) => {
              if (a && typeof a === "object" && Number.isInteger((a as any).questionId) && typeof (a as any).selected === "string") {
                return { questionId: (a as any).questionId, selected: (a as any).selected };
              }
              return null;
            })
            .filter((a: unknown): a is { questionId: number; selected: string } => a !== null)
        : [],
    });

    const res = NextResponse.json({ result, success: true, attemptId: result.attemptId, status: "SUBMITTED", resultId: (result as any).resultId ?? result.attemptId, score: result.summary.percentage, submittedAt: result.submittedAt });
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

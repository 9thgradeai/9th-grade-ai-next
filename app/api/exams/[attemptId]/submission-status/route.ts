import { NextResponse } from "next/server";
import { getSubmissionStatus } from "~backend/services/exam-submission";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";

/**
 * GET /api/exams/:attemptId/submission-status
 * Headers: Authorization: Bearer <token>
 * Returns current attempt status and authoritative result if SUBMITTED.
 * This is the reconciliation endpoint the client MUST call after a timeout
 * before retrying a submission.
 */
export async function GET(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    const { attemptId } = await params;
    const status = await getSubmissionStatus(userId, attemptId);
    const res = NextResponse.json(status);
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

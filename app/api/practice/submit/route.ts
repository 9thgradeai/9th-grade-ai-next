import { NextResponse } from "next/server";
import { submitPracticeAnswers, type SubmittedAnswer } from "~backend/services/activity";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as { answers?: SubmittedAnswer[] };
    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      throw new AppError(400, "answers must be a non-empty array.", "VALIDATION_ERROR");
    }

    const summary = await submitPracticeAnswers(userId, body.answers);
    const res = NextResponse.json({ summary });
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
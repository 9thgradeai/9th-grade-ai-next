import { NextResponse } from "next/server";
import { submitDailyQuiz, type SubmittedAnswer } from "~backend/services/activity";
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

    const body = (await request.json().catch(() => ({}))) as {
      quizId?: number;
      answers?: SubmittedAnswer[];
    };
    if (!Number.isInteger(body.quizId)) {
      throw new AppError(400, "quizId must be an integer.", "VALIDATION_ERROR");
    }
    if (!Array.isArray(body.answers) || body.answers.length === 0) {
      throw new AppError(400, "answers must be a non-empty array.", "VALIDATION_ERROR");
    }

    const quizId = body.quizId as number;
    const summary = await submitDailyQuiz(userId, quizId, body.answers);
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
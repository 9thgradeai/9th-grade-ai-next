import { NextResponse } from "next/server";
import { submitDailyQuiz, type SubmittedAnswer } from "~backend/services/activity";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse } from "~backend/errors";
import { validateSubmittedAnswers } from "~backend/validation";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../_middleware";

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
      quizId?: number;
      answers?: SubmittedAnswer[];
    };
    if (!Number.isInteger(body.quizId)) {
      throw new AppError(400, "quizId must be an integer.", "VALIDATION_ERROR");
    }
    validateSubmittedAnswers(body.answers);

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

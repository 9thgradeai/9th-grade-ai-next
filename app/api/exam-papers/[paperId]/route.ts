import { NextResponse } from "next/server";
import { getRealExamQuestions } from "~backend/services/exam-history";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ paperId: string }> }
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const { paperId } = await params;
    const paperIdNum = parseInt(paperId, 10);
    if (!Number.isInteger(paperIdNum) || paperIdNum < 1) {
      throw new AppError(400, "Invalid paper ID", "VALIDATION_ERROR");
    }

    const questions = await getRealExamQuestions(paperIdNum);

    const res = NextResponse.json({ questions });
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
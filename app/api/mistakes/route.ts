import { NextResponse } from "next/server";
import { getMistakesForUser, flattenMistakesForClient } from "~backend/services/question-progress";
import { parseErrorType } from "~backend/services/error-classifier";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
    const subject = searchParams.get("subject") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const difficulty = searchParams.get("difficulty") ?? undefined;
    const topic = searchParams.get("topic") ?? undefined;
    const errorType = parseErrorType(searchParams.get("errorType"));
    const sort = searchParams.get("sort") ?? undefined;

    const result = await getMistakesForUser(
      userId,
      { subject, status: status as "STRUGGLING" | "REVIEWING" | "IMPROVING" | "MASTERED" | undefined, difficulty, topic, errorType, sort },
      page,
      limit,
    );

    const data = flattenMistakesForClient(result.data);

    const res = NextResponse.json({
      data,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
    });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { public: false, maxAge: 0 });
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

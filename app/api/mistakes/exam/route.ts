import { NextResponse } from "next/server";
import { buildMistakeExam } from "~backend/services/mistake-exam";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, assertSameOrigin, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const config = {
      subject: typeof body.subject === "string" ? body.subject : undefined,
      count: typeof body.count === "number" ? body.count : 20,
      difficulty: typeof body.difficulty === "string" ? body.difficulty : undefined,
      focus: typeof body.focus === "string" ? body.focus : undefined,
      durationSec: typeof body.durationSec === "number" ? body.durationSec : 0,
    };

    const result = await buildMistakeExam(userId, config);

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

/* POST /api/ai/feedback — lightweight user feedback on an AI response.
   Authenticated; the referenced message must belong to the user. */

import { NextResponse } from "next/server";
import { UnauthorizedError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest } from "~backend/services/user";
import { submitFeedback } from "~backend/ai";
import { validateFeedbackBody } from "~backend/ai/schemas";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) throw new UnauthorizedError();

    const body = await request.json().catch(() => ({}));
    const feedback = validateFeedbackBody(body);
    const result = await submitFeedback({ userId, ...feedback });

    const res = NextResponse.json({ ...result, ok: true }, { status: 201 });
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
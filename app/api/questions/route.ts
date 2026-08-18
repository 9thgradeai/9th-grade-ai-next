import { NextResponse } from "next/server";
import { validateQuestionSearchParams } from "~backend/validation";
import { getQuestions, getQuestionById } from "~backend/services/content";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applyCorsHeaders, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const params = validateQuestionSearchParams(searchParams);

    let questions;
    if (params.id) {
      const single = await getQuestionById(params.id);
      questions = single ? [single] : [];
    } else {
      questions = await getQuestions({
        subject: params.subject,
        topic: params.topic,
        difficulty: params.difficulty,
        q: params.q,
        limit: params.limit,
      });
    }

    const res = NextResponse.json({ questions, page: 1, pageSize: params.limit });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);
    return res;
  }
}

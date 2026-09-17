import { NextResponse } from "next/server";
import { validateQuestionSearchParams } from "~backend/validation";
import { getQuestionById, getQuestionsPage } from "~backend/services/content";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applyCorsHeaders, applySecurityHeaders, applyCacheHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const params = validateQuestionSearchParams(searchParams);

    if (params.id) {
      const single = await getQuestionById(params.id);
      const questions = single ? [single] : [];
      const res = NextResponse.json({ questions, page: 1, pageSize: 1, total: questions.length });
      res.headers.set("X-Request-Id", requestId);
      res.headers.set("X-Response-Time", getTime() + "ms");
      applyCorsHeaders(res);
      applySecurityHeaders(res);
      return res;
    }

    const { questions, total, page, limit } = await getQuestionsPage({
      subject: params.subject,
      topic: params.topic,
      difficulty: params.difficulty,
      q: params.q,
      paths: params.paths,
      ids: params.ids,
      year: params.year,
      sourceExam: params.sourceExam,
      paperId: params.paperId,
      page: params.page,
      limit: params.limit,
    });

    const res = NextResponse.json({ questions, page, pageSize: limit, total });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res);
    applySecurityHeaders(res);
    // Public reference content — cache briefly at the edge/browser.
    applyCacheHeaders(res, { public: true, maxAge: 60, staleWhileRevalidate: 300 });
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

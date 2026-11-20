import { NextResponse } from "next/server";
import { getQuestionBankFacets } from "~backend/services/content";
import { toHttpResponse } from "~backend/errors";
import { resolveEcosystemId } from "~backend/services/ecosystem";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const ecosystemCode = searchParams.get("ecosystem");
    const ecosystemId = ecosystemCode ? await resolveEcosystemId(ecosystemCode) : undefined;
    const subject = searchParams.get("subject") ?? undefined;

    const facets = await getQuestionBankFacets({ subject, ecosystemId });

    const res = NextResponse.json({ facets });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    // Aggregates change only on import — cache briefly, like categories.
    applyCacheHeaders(res, { public: true, maxAge: 300, staleWhileRevalidate: 600 });
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

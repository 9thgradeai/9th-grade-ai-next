import { NextResponse } from "next/server";
import { getExamSelectionTree } from "~backend/services/exam";
import { resolveEcosystemId } from "~backend/services/ecosystem";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const url = new URL(request.url);
    const ecosystemCode = url.searchParams.get("ecosystem") ?? undefined;
    const ecosystemId = await resolveEcosystemId(ecosystemCode);

    const subjects = await getExamSelectionTree(ecosystemId);
    const res = NextResponse.json({ subjects });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    // no-store prevents the service worker from caching stale exam tree data
    // after seed operations or deployments. Server-side QueryCache handles
    // performance on warm serverless instances.
    res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
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
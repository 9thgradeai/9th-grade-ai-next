import { NextResponse } from "next/server";
import { getTopics } from "~backend/services/content";
import { getRequestId, startTiming, applyCacheHeaders, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject") ?? undefined;
    const topics = await getTopics(subject);
    const etag = '"topics-' + topics.length + "-" + Date.now() + '"';
    const res = NextResponse.json({ topics });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { maxAge: 300, public: true, etag });
    applySecurityHeaders(res);
    return res;
  } catch {
    const res = NextResponse.json(
      { error: { message: "Failed to fetch topics.", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

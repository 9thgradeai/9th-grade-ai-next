import { NextResponse } from "next/server";
import { getSubjects } from "~backend/services/content";
import { getRequestId, startTiming, applyCacheHeaders, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const subjects = await getSubjects();
    const etag = '"subjects-' + subjects.length + "-" + Date.now() + '"';
    const res = NextResponse.json({ subjects });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { maxAge: 300, public: true, etag });
    applySecurityHeaders(res);
    return res;
  } catch {
    const res = NextResponse.json(
      { error: { message: "Failed to fetch subjects.", code: "INTERNAL_ERROR" } },
      { status: 500 },
    );
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

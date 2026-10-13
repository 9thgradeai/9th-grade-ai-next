import { NextResponse } from "next/server";
import { getAllEcosystemSummaries } from "~backend/services/ecosystem";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    // Single batched read (1 row fetch + 2 grouped counts) — never 1 + 2N.
    const rows = await getAllEcosystemSummaries();
    const summary = rows.map((e) => ({
      id: e.id,
      code: e.code,
      slug: e.slug,
      name: e.name,
      nameBn: e.nameBn,
      description: e.description,
      descriptionBn: e.descriptionBn,
      isActive: e.isActive,
      sortOrder: e.sortOrder,
      subjectCount: e.subjectCount,
      questionCount: e.questionCount,
    }));

    const res = NextResponse.json({ ecosystems: summary });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { public: true, maxAge: 300, staleWhileRevalidate: 600 });
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

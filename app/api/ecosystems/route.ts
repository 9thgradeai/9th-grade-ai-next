import { NextResponse } from "next/server";
import { getAllEcosystems, getEcosystemSummary } from "~backend/services/ecosystem";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const ecosystems = await getAllEcosystems();
    const summary = await Promise.all(
      ecosystems.map(async (e) => {
        const { subjectCount, questionCount } = await getEcosystemSummary(e.id);
        return {
          id: e.id,
          code: e.code,
          slug: e.slug,
          name: e.name,
          nameBn: e.nameBn,
          description: e.description,
          descriptionBn: e.descriptionBn,
          isActive: e.isActive,
          sortOrder: e.sortOrder,
          subjectCount,
          questionCount,
        };
      }),
    );

    const res = NextResponse.json({ ecosystems: summary });
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

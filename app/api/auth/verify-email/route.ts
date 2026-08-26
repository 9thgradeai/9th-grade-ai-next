import { NextResponse } from "next/server";
import { toHttpResponse } from "~backend/errors";
import { verifyEmail } from "~backend/services/user";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const body = await request.json().catch(() => ({}));
    const token = typeof body?.token === "string" ? body.token : "";

    // Returns { ok: false } for expired/invalid tokens instead of throwing —
    // the client page renders an appropriate "link expired" state.
    const { ok } = await verifyEmail(token);

    const res = NextResponse.json({ ok });
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

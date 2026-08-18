import { NextResponse } from "next/server";
import { clearSessionCookie } from "~backend/auth";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  const res = NextResponse.json({ success: true });
  await clearSessionCookie(res);
  res.headers.set("X-Request-Id", requestId);
  res.headers.set("X-Response-Time", getTime() + "ms");
  applySecurityHeaders(res);
  return res;
}

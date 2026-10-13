import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { processPendingJobs } from "~backend/services/storage/syncService";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export const maxDuration = 60;

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.WORKER_SECRET;
  // In production a secret is mandatory — never fail open.
  if (process.env.NODE_ENV === "production" && !secret) return false;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  // Constant-time compare (same as the cron route) — no prefix oracle.
  return bearer.length > 0 && safeEquals(bearer, secret);
}

// POST triggers job processing. Requires Bearer CRON_SECRET/WORKER_SECRET
// in every environment except local dev. The `x-vercel-cron` header alone
// is client-spoofable and is NOT accepted as auth.
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
    }
    const count = await processPendingJobs(10);
    const res = NextResponse.json({ processed: count });
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

// GET processes too when Bearer-authorized (Vercel Cron issues GET) —
// otherwise it is a side-effect-free status probe.
export async function GET(request: Request) {
  if (isAuthorized(request)) {
    try {
      const count = await processPendingJobs(10);
      return NextResponse.json({ processed: count });
    } catch (err) {
      return toHttpResponse(err);
    }
  }
  return NextResponse.json({ ok: true, message: "Worker endpoint — POST to process" });
}

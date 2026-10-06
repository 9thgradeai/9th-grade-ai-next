// Autonomous daily current-affairs cron trigger.
// Secured with CRON_SECRET (Vercel Cron sends it as an
// Authorization: Bearer header; `?secret=` is accepted for
// manual/external schedulers). Idempotent per calendar day.

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { publishDailyNote } from "~backend/services/current-affairs";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function assertCronAuth(request: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new AppError(503, "CRON_SECRET is not configured on this deployment.", "CRON_NOT_CONFIGURED");
  }

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const querySecret = new URL(request.url).searchParams.get("secret") ?? "";

  // ?secret= exists for manual/external schedulers in dev only — in
  // production it would leak CRON_SECRET into logs/CDNs, so Bearer-only.
  const queryAllowed = process.env.NODE_ENV !== "production";
  if (!bearer && !(queryAllowed && querySecret)) {
    throw new AppError(401, "Missing cron secret.", "CRON_UNAUTHORIZED");
  }
  if ((bearer && !safeEquals(bearer, secret)) || (querySecret && !safeEquals(querySecret, secret))) {
    throw new AppError(401, "Invalid cron secret.", "CRON_UNAUTHORIZED");
  }
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertCronAuth(request);

    // Optional ?date=YYYY-MM-DD to (re)generate a specific day.
    const dateParam = new URL(request.url).searchParams.get("date");
    let day: Date;
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        throw new AppError(400, "date must be YYYY-MM-DD.", "BAD_DATE");
      }
      day = new Date(`${dateParam}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime())) {
        throw new AppError(400, "date must be YYYY-MM-DD.", "BAD_DATE");
      }
    } else {
      day = new Date();
    }

    const { note, generated } = await publishDailyNote(day);

    const res = NextResponse.json({
      note,
      date: note.date,
      generated,
    });
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

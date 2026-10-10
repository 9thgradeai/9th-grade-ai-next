// On-demand daily-note generation (self-heal for the Current Affairs tab).
// When the midnight cron missed a day (provider outage, deploys, fresh DBs),
// the tab's empty state offers to generate today's note right here instead
// of dead-ending until tomorrow. Auth required; rate-limited to 3 per hour
// per user (generation is an expensive LLM + search call). Idempotent per
// day — returns the existing note with generated:false when one exists.
import { NextResponse } from "next/server";
import { getLatestNote, normalizeDay, publishDailyNote } from "~backend/services/current-affairs";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { checkRateLimit } from "~backend/rate-limit";
import { log } from "~backend/infrastructure/observability/logger";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const body = (await request.json().catch(() => ({}))) as { date?: unknown };
    let day: Date;
    if (body.date === undefined) {
      day = new Date();
    } else if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      day = normalizeDay(body.date);
    } else {
      throw new AppError(400, "date must be YYYY-MM-DD.", "BAD_DATE");
    }
    // Never generate the future — the agent grounds on real published news.
    if (normalizeDay(day).getTime() > normalizeDay(new Date()).getTime()) {
      throw new AppError(400, "Cannot generate a note for a future date.", "BAD_DATE");
    }

    // Idempotency pre-check BEFORE the rate limiter: re-clicks and tab
    // remounts must serve the existing note without burning the 3/hour
    // generation budget (previously every failed retry consumed quota and
    // locked users out for an hour).
    const existing = await getLatestNote(day, userId);
    if (existing?.note) {
      const res = NextResponse.json({ note: existing.note, date: existing.note.date, generated: false });
      res.headers.set("X-Request-Id", requestId);
      res.headers.set("X-Response-Time", getTime() + "ms");
      applySecurityHeaders(res);
      return res;
    }

    const allowed = await checkRateLimit(`ca-generate:${userId}`, 3, 3_600_000);
    if (!allowed) {
      throw new AppError(429, "Too many generation requests — try again later.", "RATE_LIMITED");
    }

    const { note, generated } = await publishDailyNote(day);

    const res = NextResponse.json({ note, date: note.date, generated });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    // The agent throws operational 503s (AppError); anything else is an
    // unexpected failure — log it server-side but answer with an honest,
    // actionable 503 instead of a bare 500 "unexpected error".
    const operational =
      err instanceof AppError
        ? err
        : new AppError(
            503,
            "Could not generate today's note — the research service is unavailable right now. Try again in a few minutes.",
            "CA_GENERATE_UNAVAILABLE",
            true,
            { cause: err },
          );
    if (!(err instanceof AppError)) {
      log.error("current-affairs.generate-unexpected", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const res = toHttpResponse(operational);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

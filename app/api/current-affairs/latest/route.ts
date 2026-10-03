import { NextResponse } from "next/server";
import {
  getLatestNote,
  getMostRecentNote,
  normalizeDay,
} from "~backend/services/current-affairs";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const dateParam = new URL(request.url).searchParams.get("date");
    let day: Date;
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        throw new AppError(400, "date must be YYYY-MM-DD.", "BAD_DATE");
      }
      day = normalizeDay(dateParam);
    } else {
      day = new Date();
    }

    // A specific date is a direct lookup; no date serves the most
    // recent published note (today's may not exist yet).
    const payload = dateParam
      ? await getLatestNote(day, userId)
      : await getMostRecentNote(userId);

    const res = NextResponse.json(payload);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCacheHeaders(res, { public: false, maxAge: 0 });
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

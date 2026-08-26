import { NextResponse } from "next/server";
import { getFlashcards } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject") ?? undefined;
    // Optional auth: authenticated callers additionally receive their own SRS
    // state overlay (`srs` field per card).
    const userId = await getUserIdFromRequest(request);
    const flashcards = await getFlashcards(subject, userId);

    const res = NextResponse.json({ flashcards });
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

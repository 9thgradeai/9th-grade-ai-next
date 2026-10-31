import { NextResponse } from "next/server";
import { getVocabStream, type VocabStreamMode } from "~backend/services/vocab-stream";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../../_middleware";

const VALID_MODES: VocabStreamMode[] = ["due", "daily", "mixed", "all"];

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const { searchParams } = new URL(request.url);
    const mode = (searchParams.get("mode") ?? "mixed") as VocabStreamMode;
    const cursor = searchParams.get("cursor");
    const limit = searchParams.get("limit");

    if (!VALID_MODES.includes(mode)) {
      const res = NextResponse.json(
        { error: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}.` },
        { status: 400 },
      );
      res.headers.set("X-Request-Id", requestId);
      res.headers.set("X-Response-Time", getTime + "ms");
      applySecurityHeaders(res);
      return res;
    }

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      const res = NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
      res.headers.set("X-Request-Id", requestId);
      res.headers.set("X-Response-Time", getTime + "ms");
      applySecurityHeaders(res);
      return res;
    }

    const stream = await getVocabStream(userId, {
      mode,
      cursor: cursor ? Math.max(0, Math.floor(parseInt(cursor, 10) || 0)) : 0,
      limit: limit ? Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100) : 10,
    });

    const res = NextResponse.json(stream);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime + "ms");
    applyCacheHeaders(res, { public: false, maxAge: 0 });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

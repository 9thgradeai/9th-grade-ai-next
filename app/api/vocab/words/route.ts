import { NextResponse } from "next/server";
import { getVocabWords } from "~backend/services/vocab";
import { getUserIdFromRequest } from "~backend/services/user";
import { toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get("all") === "true";
    // An exhaustive `all=true` request bypasses the per-page clamp; the
    // service caps it at 5000 rows so the full corpus can be returned.
    const limitParam = searchParams.get("limit");
    const limit = !all && limitParam ? Math.min(100, Math.max(1, parseInt(limitParam, 10))) : undefined;
    const exam = searchParams.get("exam") ?? undefined;
    const difficulty = searchParams.get("difficulty") ?? undefined;
    const search = searchParams.get("search") ?? undefined;
    const due = searchParams.get("due") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const kind = searchParams.get("kind") ?? undefined;
    const userId = await getUserIdFromRequest(request);
    const words = await getVocabWords(userId ?? undefined, { limit, exam, difficulty, search, due, status, kind, all });
    const res = NextResponse.json({ words });
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

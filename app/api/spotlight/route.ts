import { NextResponse } from "next/server";
import { getSpotlightQuestions } from "~backend/services/content";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertReadAllowed } from "~backend/rate-limit";
import { toHttpResponse } from "~backend/errors";
import { resolveEcosystemId } from "~backend/services/ecosystem";
import { getRequestId, startTiming, applyCorsHeaders, applySecurityHeaders } from "../_middleware";

// GET /api/spotlight?ecosystem=&count=&exclude=
// Home-tab rotating MCQ: a small batch of RANDOM questions drawn strictly
// from the stored question bank (round-robin across subjects, no repeats
// within `exclude`). No generation, no AI — pure database reads.
// - count: 1–30, default 12
// - exclude: comma-separated question ids already shown (max 200 honored)
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);

    // DB-heavy public endpoint — IP/user read bucket (scraper protection).
    // Identity lookup must never break the request: fall back to IP bucket.
    await assertReadAllowed(request, "spotlight", await getUserIdFromRequest(request).catch(() => null));

    const ecosystemCode = searchParams.get("ecosystem");
    const ecosystemId = ecosystemCode ? await resolveEcosystemId(ecosystemCode) : undefined;

    const countRaw = searchParams.get("count");
    const count = countRaw === null ? 12 : Math.min(30, Math.max(1, Math.floor(Number(countRaw) || 12)));

    const excludeRaw = searchParams.get("exclude");
    const excludeIds = (excludeRaw ?? "")
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 200);

    const questions = await getSpotlightQuestions({ ecosystemId, count, excludeIds });

    // Random per call by design — never edge/browser-cache this response.
    const res = NextResponse.json({ questions });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    res.headers.set("Cache-Control", "no-store");
    applyCorsHeaders(res, request);
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applyCorsHeaders(res, request);
    applySecurityHeaders(res);
    return res;
  }
}

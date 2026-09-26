import { NextResponse } from "next/server";
import {
  getPreparationIntelligence,
  getIntelligencePulse,
  getIntelligenceTasks,
  getIntelligenceAnalytics,
  type IntelligenceScope,
} from "~backend/services/preparation-intelligence";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, applyCacheHeaders } from "../_middleware";

const SCOPES: IntelligenceScope[] = ["pulse", "tasks", "analytics", "full"];

// Unifies every dashboard analytics call into ONE authenticated, server-side
// aggregation. Home + Progress render from this single payload so they can
// never disagree on a metric.
//
// Staged loading (Phase 1): `?scope=pulse` returns only the cheap header
// fields (overall, short activity window, streak, next exam) so Home paints
// instantly; `?scope=tasks` returns today's plan; `?scope=analytics` returns
// the heavy mastery/mistake/recommendation aggregates. Omitting `scope`
// returns the full DTO (Progress tab, WorldMap backdrop).
// `?window=<days>` overrides the activity window for full loads (1–365).
// Response is intentionally NOT cached: the dashboard must reflect the very
// last practice/exam/mistake action.
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const url = new URL(request.url);
    const scopeParam = url.searchParams.get("scope") ?? "full";
    if (!SCOPES.includes(scopeParam as IntelligenceScope)) {
      throw new AppError(400, `Unknown scope "${scopeParam}"`, "INTELLIGENCE_BAD_SCOPE");
    }
    const scope = scopeParam as IntelligenceScope;
    const windowParam = url.searchParams.get("window");
    const activityDays = windowParam == null ? undefined : Number(windowParam);
    if (activityDays !== undefined && (!Number.isInteger(activityDays) || activityDays < 1 || activityDays > 365)) {
      throw new AppError(400, `Invalid window "${windowParam}"`, "INTELLIGENCE_BAD_WINDOW");
    }

    const intelligence =
      scope === "pulse"
        ? await getIntelligencePulse(userId)
        : scope === "tasks"
          ? await getIntelligenceTasks(userId)
          : scope === "analytics"
            ? await getIntelligenceAnalytics(userId)
            : await getPreparationIntelligence(userId, { activityDays });

    const res = NextResponse.json({ intelligence, scope });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    res.headers.set("X-Intelligence-Scope", scope);
    applyCacheHeaders(res, { public: false, maxAge: 0 });
    applySecurityHeaders(res);
    return res;
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
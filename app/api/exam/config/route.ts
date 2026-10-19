import { NextResponse } from "next/server";
import { getExamSelectionTree } from "~backend/services/exam";
import { toHttpResponse } from "~backend/errors";
import { resolveEcosystemId } from "~backend/services/ecosystem";
import {
  resolveExamConfig,
  summarizeExamConfig,
  type ExamConfig,
  type ExamConfigSummary,
} from "~backend/services/exam-config";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

/**
 * GET /api/exam/config?ecosystem=BCS[&full=1]
 *
 * Returns the exam selection tree (question counts per topic) AND, for a known
 * ecosystem, the canonical syllabus-driven configuration that describes the
 * official paper shape (subjects, marks, official suballocations, scoring).
 *
 * Backward compatible: `subjects` is unchanged; `examConfig` /
 * `examConfigSummary` are additive. The full `examConfig` (with topic paths) is
 * only included when `full=1` — otherwise just the compact summary — so the
 * common tree request stays small.
 */
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const ecosystemCode = searchParams.get("ecosystem");
    const full = searchParams.get("full") === "1";
    const ecosystemId = ecosystemCode ? await resolveEcosystemId(ecosystemCode) : undefined;

    const subjects = await getExamSelectionTree(ecosystemId);

    let examConfig: ExamConfig | null = null;
    let examConfigSummary: (ExamConfigSummary & { valid: boolean }) | null = null;
    if (ecosystemCode) {
      const resolved = resolveExamConfig(ecosystemCode);
      if (resolved) {
        // A broken config must never be advertised as buildable — surface the
        // validation flag instead of silently serving an invalid paper shape.
        examConfigSummary = {
          ...summarizeExamConfig(resolved.config),
          valid: resolved.validation.valid,
        };
        if (full) examConfig = resolved.config;
      }
    }

    const res = NextResponse.json({
      subjects,
      examConfig,
      examConfigSummary,
    });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    // no-store prevents the service worker from caching stale exam tree data
    // after seed operations or deployments. Server-side QueryCache handles
    // performance on warm serverless instances.
    res.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate");
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

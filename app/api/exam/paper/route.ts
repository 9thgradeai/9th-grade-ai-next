import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import { AppError, toHttpResponse } from "~backend/errors";
import {
  buildConfiguredPaper,
  getPaperReadiness,
  type PaperBuildRequest,
} from "~backend/services/exam-paper";
import { isExamEcosystemCode, type ExamMode } from "~backend/services/exam-config";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
  readJsonBody,
} from "../../_middleware";

const MODES: readonly ExamMode[] = ["practice", "mock", "real"];
// Custom papers share the custom-exam ceiling; full papers are capped by the
// largest official paper (200).
const MAX_QUESTIONS = 200;

/**
 * GET /api/exam/paper?ecosystem=BCS
 *
 * Report whether the official full paper can be assembled from the live
 * inventory today (per-subject capacity + deficits). No questions are selected.
 */
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const { searchParams } = new URL(request.url);
    const ecosystemCode = searchParams.get("ecosystem");
    if (!isExamEcosystemCode(ecosystemCode)) {
      throw new AppError(
        400,
        "ecosystem must be BCS or BANGLADESH_BANK.",
        "VALIDATION_ERROR",
      );
    }

    const readiness = await getPaperReadiness(ecosystemCode);
    if (!readiness) {
      throw new AppError(404, "Unknown exam ecosystem.", "NOT_FOUND");
    }

    const res = NextResponse.json({ readiness });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
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

/** Strict shape check before the DB-heavy builder runs. */
function validatePaperBody(body: unknown): PaperBuildRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "Request body must be an object.", "VALIDATION_ERROR");
  }
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    if (!["ecosystem", "mode", "selection", "shuffleQuestions", "seed"].includes(key)) {
      throw new AppError(400, `Unknown field: ${key}.`, "VALIDATION_ERROR");
    }
  }
  if (!isExamEcosystemCode(b.ecosystem)) {
    throw new AppError(
      400,
      "ecosystem must be BCS or BANGLADESH_BANK.",
      "VALIDATION_ERROR",
    );
  }
  if (typeof b.mode !== "string" || !(MODES as readonly string[]).includes(b.mode)) {
    throw new AppError(
      400,
      "mode must be practice, mock, or real.",
      "VALIDATION_ERROR",
    );
  }
  if (b.shuffleQuestions !== undefined && typeof b.shuffleQuestions !== "boolean") {
    throw new AppError(400, "shuffleQuestions must be a boolean.", "VALIDATION_ERROR");
  }
  if (b.seed !== undefined && (!Number.isInteger(b.seed) || Math.abs(b.seed as number) > 2 ** 31)) {
    throw new AppError(400, "seed must be a 32-bit integer.", "VALIDATION_ERROR");
  }

  const raw = b.selection;
  let selection: PaperBuildRequest["selection"];
  if (raw !== undefined) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AppError(400, "selection must be an object.", "VALIDATION_ERROR");
    }
    const s = raw as Record<string, unknown>;
    for (const key of Object.keys(s)) {
      if (!["subjects", "requested", "perSubject"].includes(key)) {
        throw new AppError(400, `Unknown selection field: ${key}.`, "VALIDATION_ERROR");
      }
    }
    if (s.requested !== undefined) {
      if (
        !Number.isInteger(s.requested) ||
        (s.requested as number) < 1 ||
        (s.requested as number) > MAX_QUESTIONS
      ) {
        throw new AppError(
          400,
          `selection.requested must be an integer in [1, ${MAX_QUESTIONS}].`,
          "VALIDATION_ERROR",
        );
      }
    }
    if (s.subjects !== undefined) {
      if (!Array.isArray(s.subjects) || s.subjects.length === 0 || s.subjects.length > 20) {
        throw new AppError(400, "selection.subjects must be a non-empty array (max 20).", "VALIDATION_ERROR");
      }
      for (const sub of s.subjects) {
        if (!sub || typeof sub !== "object") {
          throw new AppError(400, "Each selection subject must be an object.", "VALIDATION_ERROR");
        }
        const sc = sub as Record<string, unknown>;
        if (typeof sc.subjectId !== "string" || sc.subjectId.length === 0 || sc.subjectId.length > 100) {
          throw new AppError(400, "selection.subjects[].subjectId must be a config subject id string.", "VALIDATION_ERROR");
        }
        if (
          sc.topics !== undefined &&
          (!Array.isArray(sc.topics) ||
            sc.topics.some((t) => typeof t !== "string" || (t as string).length > 120))
        ) {
          throw new AppError(400, "selection.subjects[].topics must be an array of config topic ids.", "VALIDATION_ERROR");
        }
      }
    }
    if (s.perSubject !== undefined) {
      if (!s.perSubject || typeof s.perSubject !== "object" || Array.isArray(s.perSubject)) {
        throw new AppError(400, "selection.perSubject must be an object.", "VALIDATION_ERROR");
      }
      for (const [key, value] of Object.entries(s.perSubject as Record<string, unknown>)) {
        if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_QUESTIONS) {
          throw new AppError(400, `selection.perSubject.${key} must be an integer in [0, ${MAX_QUESTIONS}].`, "VALIDATION_ERROR");
        }
      }
    }
    selection = s as unknown as PaperBuildRequest["selection"];
  }

  return {
    ecosystemCode: b.ecosystem,
    mode: b.mode as ExamMode,
    selection,
    shuffleQuestions: b.shuffleQuestions as boolean | undefined,
    seed: b.seed as number | undefined,
  };
}

/**
 * POST /api/exam/paper
 *
 * Assemble a syllabus-driven paper for an ecosystem and mode. Full papers
 * (mock/real) enforce the official subject quotas as hard constraints and fail
 * with 422 when inventory cannot satisfy them; practice papers may disclose
 * deviations. Auth + the same submit bucket as exam start/submit apply, because
 * this is a DB-heavy deterministic build.
 */
export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    await assertSubmitAllowed(userId);

    const body = validatePaperBody(await readJsonBody(request));
    const paper = await buildConfiguredPaper(body);

    const res = NextResponse.json({ paper });
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    if (err instanceof SyntaxError) {
      err = new AppError(400, "Invalid JSON body.", "VALIDATION_ERROR");
    }
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

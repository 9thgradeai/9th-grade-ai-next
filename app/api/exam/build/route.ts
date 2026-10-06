import { NextResponse } from "next/server";
import { buildCustomExam } from "~backend/services/exam";
import { getUserIdFromRequest } from "~backend/services/user";
import { assertSubmitAllowed } from "~backend/rate-limit";
import type { ExamSelectionRequest } from "@/lib/types";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin, readJsonBody } from "../../_middleware";

/** Strict shape check before the DB-heavy builder runs. */
function validateBuildBody(body: unknown): ExamSelectionRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError(400, "Request body must be an object.", "VALIDATION_ERROR");
  }
  const b = body as Record<string, unknown>;
  for (const key of Object.keys(b)) {
    if (!["subjects", "questionCount", "durationSec", "shuffleQuestions", "seed"].includes(key)) {
      throw new AppError(400, `Unknown field: ${key}.`, "VALIDATION_ERROR");
    }
  }
  if (!Array.isArray(b.subjects) || b.subjects.length === 0 || b.subjects.length > 20) {
    throw new AppError(400, "subjects must be a non-empty array (max 20).", "VALIDATION_ERROR");
  }
  for (const s of b.subjects) {
    if (!s || typeof s !== "object") throw new AppError(400, "Each subject must be an object.", "VALIDATION_ERROR");
    const sub = s as Record<string, unknown>;
    if (!Number.isInteger(sub.subjectId) || (sub.subjectId as number) <= 0) {
      throw new AppError(400, "subjects[].subjectId must be a positive integer.", "VALIDATION_ERROR");
    }
    if (!Array.isArray(sub.paths) || sub.paths.some((p) => typeof p !== "string" || p.length > 500)) {
      throw new AppError(400, "subjects[].paths must be an array of strings.", "VALIDATION_ERROR");
    }
    if (sub.count !== undefined && (!Number.isInteger(sub.count) || (sub.count as number) <= 0 || (sub.count as number) > 200)) {
      throw new AppError(400, "subjects[].count must be an integer in [1, 200].", "VALIDATION_ERROR");
    }
  }
  if (!Number.isInteger(b.questionCount) || (b.questionCount as number) <= 0 || (b.questionCount as number) > 200) {
    throw new AppError(400, "questionCount must be an integer in [1, 200].", "VALIDATION_ERROR");
  }
  if (typeof b.durationSec !== "number" || !Number.isFinite(b.durationSec) || b.durationSec < 0 || b.durationSec > 6 * 60 * 60) {
    throw new AppError(400, "durationSec must be a number in [0, 21600].", "VALIDATION_ERROR");
  }
  if (b.shuffleQuestions !== undefined && typeof b.shuffleQuestions !== "boolean") {
    throw new AppError(400, "shuffleQuestions must be a boolean.", "VALIDATION_ERROR");
  }
  if (b.seed !== undefined && (!Number.isInteger(b.seed) || Math.abs(b.seed as number) > 2 ** 31)) {
    throw new AppError(400, "seed must be a 32-bit integer.", "VALIDATION_ERROR");
  }
  return b as unknown as ExamSelectionRequest;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    // Exam construction is DB-heavy (full-pool selection + shuffle); require a
    // session so it can't be hammered anonymously.
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    // DB-heavy builder — same per-user submit bucket as exam start/submit.
    await assertSubmitAllowed(userId);

    const body = validateBuildBody(await readJsonBody(request));
    const exam = await buildCustomExam(body);

    const res = NextResponse.json({ exam });
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

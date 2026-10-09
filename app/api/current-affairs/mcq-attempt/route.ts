// Current-affairs MCQ exam submission — persists exam-mode answers so the
// tab's quiz feeds progress/accuracy/streak/activity like every other mode.
import { NextResponse } from "next/server";
import { submitMcqAttempts } from "~backend/services/current-affairs";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { assertNoUnknownFields } from "~backend/validation";
import { QueryCache } from "~backend/infrastructure/cache/query-cache";
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

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    assertNoUnknownFields(body, ["dailyNoteId", "answers", "ecosystemId"]);

    const dailyNoteId = body.dailyNoteId;
    if (typeof dailyNoteId !== "string" || dailyNoteId.length < 3 || dailyNoteId.length > 64) {
      throw new AppError(400, "dailyNoteId must be a valid note id.", "VALIDATION_ERROR");
    }
    if (!Array.isArray(body.answers) || body.answers.length === 0 || body.answers.length > 20) {
      throw new AppError(400, "answers must be a non-empty array (max 20).", "VALIDATION_ERROR");
    }
    const answers = body.answers.map((a) => {
      const row = a as { mcqId?: unknown; selectedOption?: unknown; durationSec?: unknown };
      if (typeof row.mcqId !== "string" || !Number.isInteger(row.selectedOption)) {
        throw new AppError(400, "Each answer needs { mcqId: string, selectedOption: int }.", "VALIDATION_ERROR");
      }
      const durationSec = row.durationSec === undefined ? 0 : row.durationSec;
      if (!Number.isInteger(durationSec) || (durationSec as number) < 0) {
        throw new AppError(400, "durationSec must be a non-negative integer.", "VALIDATION_ERROR");
      }
      return { mcqId: row.mcqId, selectedOption: row.selectedOption as number, durationSec: durationSec as number };
    });
    const ecosystemId =
      body.ecosystemId === undefined || body.ecosystemId === null
        ? null
        : typeof body.ecosystemId === "number" && Number.isInteger(body.ecosystemId)
          ? (body.ecosystemId as number)
          : (() => {
              throw new AppError(400, "ecosystemId must be an integer.", "VALIDATION_ERROR");
            })();

    const summary = await submitMcqAttempts(userId, dailyNoteId, answers, ecosystemId);
    await QueryCache.invalidateIntelligence(userId);

    const res = NextResponse.json({ summary });
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

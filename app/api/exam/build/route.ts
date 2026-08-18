import { NextResponse } from "next/server";
import { buildCustomExam } from "~backend/services/exam";
import type { ExamSelectionRequest } from "@/lib/types";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<ExamSelectionRequest>;
    const exam = await buildCustomExam(body as ExamSelectionRequest);

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
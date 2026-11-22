import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../../_middleware";

export async function GET(request: Request, { params }: { params: Promise<{ attemptId: string }> }) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  const { attemptId } = await params;
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    // Entitlement is enforced server-side; this route is a seam that returns
    // 404 until a real store + attempt lookup is wired (see Phase 12 service).
    throw new AppError(404, "Not implemented", "ADAPTIVE_ANSWER_KEY_MISSING");
  } catch (err) {
    const res = toHttpResponse(err);
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-Response-Time", getTime() + "ms");
    applySecurityHeaders(res);
    return res;
  }
}

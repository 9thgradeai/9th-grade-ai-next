import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../../_middleware";
import { createDefaultAdaptiveOrchestrator } from "~backend/services/adaptive-exam/orchestrator-factory";

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }
    const body = await request.json();
    const orchestrator = createDefaultAdaptiveOrchestrator();
    const ctx = { userId, requestId, ports: {} as any };
    const session = await orchestrator.startSession(ctx, body);
    const res = NextResponse.json({ session });
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

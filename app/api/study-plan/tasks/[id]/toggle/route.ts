import { NextResponse } from "next/server";
import { toggleStudyTask, getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse, ValidationError } from "~backend/errors";
import {
  getRequestId,
  startTiming,
  applySecurityHeaders,
  assertSameOrigin,
} from "../../../../_middleware";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);

    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const { id } = await params;
    const taskId = Number(id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new ValidationError("Task id must be a positive integer.");
    }

    const result = await toggleStudyTask(userId, taskId);
    const res = NextResponse.json(result);
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

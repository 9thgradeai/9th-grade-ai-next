import { NextResponse } from "next/server";
import { deleteUserNotification } from "~backend/services/notification";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse, ValidationError } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../_middleware";

export async function DELETE(
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
    const notificationId = Number(id);
    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new ValidationError("Notification id must be a positive integer.");
    }

    // Ownership-scoped: deletes the caller's own notification, hides (marks
    // read) shared broadcasts. Never deletes another user's row.
    await deleteUserNotification(userId, notificationId);
    const res = NextResponse.json({ deleted: true });
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

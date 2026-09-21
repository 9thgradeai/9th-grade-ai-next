// app/api/admin/users/[id]/route.ts
// Admin: Get user details, ban, impersonate (admin only)

import { NextResponse } from "next/server";
import { requireRole } from "~backend/services/user";
import { getUserDetail, adminAction } from "~backend/services/admin";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);
    const { id } = await params;

    const user = await getUserDetail(id);
    const { passwordHash: _, emailVerifyToken: __, passwordResetToken: ___, ...safeUser } = user;

    const res = NextResponse.json({ user: safeUser });
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    assertSameOrigin(request);
    await requireRole(request, ["admin"]);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { action } = body as { action?: "ban" | "unban" | "revoke_sessions" };

    if (!action) {
      throw new AppError(400, "Action required", "VALIDATION_ERROR");
    }

    const result = await adminAction(id, action);

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

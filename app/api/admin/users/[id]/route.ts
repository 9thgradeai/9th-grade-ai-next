// app/api/admin/users/[id]/route.ts
// Admin: Get user details, ban, impersonate (admin only)

import { NextResponse } from "next/server";
import { requireRole } from "~backend/services/user";
import { getUserDetail, adminAction } from "~backend/services/admin";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin, readJsonBody } from "../../../_middleware";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);
    const { id } = await params;
    if (typeof id !== "string" || !/^c[a-z0-9]{20,}$/i.test(id)) {
      throw new AppError(400, "Invalid user id.", "VALIDATION_ERROR");
    }

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

    // IDs are CUIDs (created by Prisma); reject path garbage before it
    // reaches the service layer.
    if (typeof id !== "string" || !/^c[a-z0-9]{20,}$/i.test(id)) {
      throw new AppError(400, "Invalid user id.", "VALIDATION_ERROR");
    }

    const body = await readJsonBody(request);
    const { action } = body as { action?: unknown };

    if (action !== "ban" && action !== "unban" && action !== "revoke_sessions") {
      throw new AppError(400, "Action must be ban, unban or revoke_sessions.", "VALIDATION_ERROR");
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

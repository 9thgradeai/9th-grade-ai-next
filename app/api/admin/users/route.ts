// app/api/admin/users/route.ts
// Admin: List users with pagination (admin only)

import { NextResponse } from "next/server";
import { requireRole } from "~backend/services/user";
import { listUsers } from "~backend/services/admin";
import { toHttpResponse } from "~backend/errors";
import { parseAdminListParams } from "~backend/validation";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);

    const url = new URL(request.url);
    const { page, limit, search } = parseAdminListParams(url);

    const result = await listUsers({ page, limit, search });

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

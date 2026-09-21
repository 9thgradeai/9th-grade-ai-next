// app/api/auth/export/route.ts
// GDPR Article 15/20: User data export (portability)

import { NextResponse } from "next/server";
import { getSessionUser } from "~backend/auth";
import { exportUserData } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const user = await getSessionUser(request);
    if (!user) {
      throw new AppError(401, "Not authenticated", "AUTH_UNAUTHORIZED");
    }

    const exportData = await exportUserData(user.id);
    const json = JSON.stringify(exportData, null, 2);
    const filename = `9th-grade-ai-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;

    const res = new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
    applySecurityHeaders(res);
    return res;
  } catch (err) {
    const res = toHttpResponse(err);
    applySecurityHeaders(res);
    return res;
  }
}

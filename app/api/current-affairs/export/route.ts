// Server-side PDF study-sheet export (pdfkit — no client
// html2pdf bundle). Authenticated, per-user, per-day.

import { NextResponse } from "next/server";
import {
  getLatestNote,
  getMostRecentNote,
  normalizeDay,
  buildNotePdf,
} from "~backend/services/current-affairs";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const params = new URL(request.url).searchParams;
    const dateParam = params.get("date");
    let day: Date;
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        throw new AppError(400, "date must be YYYY-MM-DD.", "BAD_DATE");
      }
      day = normalizeDay(dateParam);
    } else {
      day = new Date();
    }

    const payload = dateParam
      ? await getLatestNote(day, userId)
      : await getMostRecentNote(userId);

    if (!payload.note) {
      throw new AppError(404, "No current-affairs note for this date.", "NOT_FOUND");
    }

    const pdf = await buildNotePdf(payload.note);

    const res = new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="current-affairs-${payload.note.date}.pdf"`,
      },
    });
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

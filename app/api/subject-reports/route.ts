// src/app/api/subject-reports/route.ts — per-subject progress reports.
// Aggregated from the caller's real QuestionAttempt records, grouped by
// subject. Subjects with no attempts report 0 with no fabricated trend.
import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const [subjects, attempts] = await Promise.all([
      prisma.subject.findMany({ orderBy: { sortOrder: "asc" }, select: { nameBn: true } }),
      prisma.questionAttempt.findMany({
        where: { userId },
        select: { subjectName: true, correct: true },
      }),
    ]);

    const bySubject = new Map<string, { attempted: number; correct: number }>();
    for (const a of attempts) {
      const key = a.subjectName || "অন্যান্য";
      const entry = bySubject.get(key) ?? { attempted: 0, correct: 0 };
      entry.attempted += 1;
      if (a.correct) entry.correct += 1;
      bySubject.set(key, entry);
    }

    const reports = subjects.map((s) => {
      const entry = bySubject.get(s.nameBn);
      const attempted = entry?.attempted ?? 0;
      const correct = entry?.correct ?? 0;
      const score = attempted > 0 ? Math.min(100, Math.round((correct / attempted) * 100)) : 0;
      return { name: s.nameBn, score, attempted, correct };
    });

    const res = NextResponse.json({ reports });
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
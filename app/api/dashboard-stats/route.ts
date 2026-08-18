import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { getUserIdFromRequest } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../_middleware";

// Per-user dashboard stats, derived from the caller's own progress.
// Rank is computed against every user's total points (real leaderboard).
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    const userId = await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
    }

    const [questionCount, progress] = await Promise.all([
      prisma.question.count(),
      prisma.userProgress.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
    ]);

    const rank =
      (await prisma.userProgress.count({
        where: { points: { gt: progress.points } },
      })) + 1;

    const stats = {
      points: progress.points,
      exams: progress.examsAttempted,
      rank,
      streak: progress.streak,
      questionsAnswered: progress.questionsAnswered,
      accuracy: progress.accuracy,
      completion:
        questionCount > 0
          ? Math.min(100, Math.round((progress.questionsAnswered / (questionCount * 10)) * 100))
          : 0,
    };

    const res = NextResponse.json({ stats });
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
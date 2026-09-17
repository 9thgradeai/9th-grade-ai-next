import { NextResponse } from "next/server";
import { getMistakesForUser } from "~backend/services/question-progress";
import { parseErrorType } from "~backend/services/error-classifier";
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

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? "20") || 20));
    const subject = searchParams.get("subject") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const difficulty = searchParams.get("difficulty") ?? undefined;
    const topic = searchParams.get("topic") ?? undefined;
    const errorType = parseErrorType(searchParams.get("errorType"));
    const sort = searchParams.get("sort") ?? undefined;

    const result = await getMistakesForUser(
      userId,
      { subject, status: status as "STRUGGLING" | "REVIEWING" | "IMPROVING" | "MASTERED" | undefined, difficulty, topic, errorType, sort },
      page,
      limit,
    );

    // Flatten question data into the response for the client
    const data = result.data.map((row) => ({
      id: row.id,
      questionId: row.questionId,
      totalAttempts: row.totalAttempts,
      correctAttempts: row.correctAttempts,
      incorrectAttempts: row.incorrectAttempts,
      consecutiveCorrect: row.consecutiveCorrect,
      mistakeCount: row.mistakeCount,
      masteryScore: row.masteryScore,
      masteryStatus: row.masteryStatus,
      isMistake: row.isMistake,
      firstIncorrectAt: row.firstIncorrectAt?.toISOString() ?? null,
      lastIncorrectAt: row.lastIncorrectAt?.toISOString() ?? null,
      lastCorrectAt: row.lastCorrectAt?.toISOString() ?? null,
      lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      reviewCount: row.reviewCount,
      lastSubject: row.lastSubject,
      lastTopic: row.lastTopic,
      // Question metadata
      question: {
        id: (row.question as Record<string, unknown>).id,
        subjectId: (row.question as Record<string, unknown>).subjectId,
        subject: ((row.question as Record<string, unknown>).subject as Record<string, unknown>)?.nameBn ?? "",
        topic: (row.question as Record<string, unknown>).topic,
        subtopic: (row.question as Record<string, unknown>).subtopic,
        question: (row.question as Record<string, unknown>).question,
        options: (row.question as Record<string, unknown>).options,
        correctAnswer: (row.question as Record<string, unknown>).correctAnswer,
        explanation: (row.question as Record<string, unknown>).explanation,
        difficulty: (row.question as Record<string, unknown>).difficulty,
        year: (row.question as Record<string, unknown>).year,
        sourceExam: (row.question as Record<string, unknown>).sourceExam,
        bcsTerm: null,
        // Latest error classification (Phase 2) — from the question's newest attempt.
        latestErrorType:
          (((row.question as Record<string, unknown>).attempts as
            | Array<{ errorType?: string | null }>
            | undefined)?.[0]?.errorType) ?? null,
      },
    }));

    const res = NextResponse.json({
      data,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
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

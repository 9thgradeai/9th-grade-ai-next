// app/api/auth/export/route.ts
// GDPR Article 15/20: User data export (portability)

import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { getSessionUser } from "~backend/auth";
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

    // Fetch all user data
    const [
      profile,
      progress,
      attempts,
      mockResults,
      bookmarks,
      flashcardReviews,
      studyCompletions,
      aiConversations,
      aiMessages,
      aiMemories,
      aiUsage,
      aiFeedback,
      dailyQuizParticipations,
      notifications,
      notificationReads,
      userBadges,
      sessions,
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          handle: true,
          role: true,
          emailVerified: true,
          onboarded: true,
          authProvider: true,
          imageUrl: true,
          examTarget: true,
          examDate: true,
          prepLevel: true,
          studyHoursPerDay: true,
          goal: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.userProgress.findUnique({ where: { userId: user.id } }),
      prisma.questionAttempt.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mockTestResult.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.bookmark.findMany({
        where: { userId: user.id },
        include: { question: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.flashcardReview.findMany({
        where: { userId: user.id },
        include: { flashcard: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.studyTaskCompletion.findMany({
        where: { userId: user.id },
        include: { task: true },
        orderBy: { completedAt: "desc" },
      }),
      prisma.aIConversation.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.aIMessage.findMany({
        where: { conversation: { userId: user.id } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.aIMemory.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.aIUsage.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.aIFeedback.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.dailyQuizParticipation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.appNotification.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: "desc" },
      }),
      prisma.notificationRead.findMany({
        where: { userId: user.id },
        orderBy: { readAt: "desc" },
      }),
      prisma.userBadge.findMany({
        where: { userId: user.id },
        include: { badge: true },
        orderBy: { unlockedAt: "desc" },
      }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: { sessions: true },
      }),
    ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      userId: user.id,
      profile,
      progress,
      attempts,
      mockResults,
      bookmarks,
      flashcardReviews,
      studyCompletions,
      aiConversations,
      aiMessages,
      aiMemories,
      aiUsage,
      aiFeedback,
      dailyQuizParticipations,
      notifications,
      notificationReads,
      userBadges,
      sessions: sessions?.sessions ?? [],
    };

    const json = JSON.stringify(exportData, null, 2);
    const filename = `9th-grade-ai-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Request-Id": requestId,
        "X-Response-Time": getTime() + "ms",
      },
    });
  } catch (err) {
    return toHttpResponse(err);
  }
}
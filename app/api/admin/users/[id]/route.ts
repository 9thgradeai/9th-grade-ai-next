// app/api/admin/users/[id]/route.ts
// Admin: Get user details, ban, impersonate (admin only)

import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { requireRole } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders, assertSameOrigin } from "../../../_middleware";
import { revokeAllSessions } from "~backend/services/user";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        progress: true,
        _count: {
          select: {
            attempts: true,
            mockTestResults: true,
            aiConversations: true,
            bookmarks: true,
            flashcardReviews: true,
            studyTaskCompletions: true,
            notifications: true,
            dailyQuizParticipations: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }

    const { passwordHash: _, emailVerifyToken: __, passwordResetToken: ___, ...safeUser } = user;

    return NextResponse.json(
      { user: safeUser },
      { headers: { "X-Request-Id": requestId, "X-Response-Time": getTime() + "ms" } },
    );
  } catch (err) {
    return toHttpResponse(err);
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

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new AppError(404, "User not found", "NOT_FOUND");
    }

    if (action === "ban") {
      // Ban by setting a flag and revoking all sessions
      await prisma.user.update({
        where: { id },
        data: { role: "BANNED" as any }, // Using role as ban flag for simplicity
      });
      await revokeAllSessions(id);
    } else if (action === "unban") {
      await prisma.user.update({
        where: { id },
        data: { role: "STUDENT" },
      });
    } else if (action === "revoke_sessions") {
      await revokeAllSessions(id);
    } else {
      throw new AppError(400, "Invalid action", "VALIDATION_ERROR");
    }

    return NextResponse.json(
      { success: true, action },
      { headers: { "X-Request-Id": requestId, "X-Response-Time": getTime() + "ms" } },
    );
  } catch (err) {
    return toHttpResponse(err);
  }
}
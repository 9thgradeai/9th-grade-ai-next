// app/api/admin/users/route.ts
// Admin: List users with pagination (admin only)

import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import { requireRole } from "~backend/services/user";
import { AppError, toHttpResponse } from "~backend/errors";
import { getRequestId, startTiming, applySecurityHeaders } from "../../_middleware";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const getTime = startTiming();

  try {
    await requireRole(request, ["admin"]);

    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "20")));
    const search = url.searchParams.get("search") ?? "";
    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
            { handle: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          handle: true,
          role: true,
          emailVerified: true,
          onboarded: true,
          authProvider: true,
          createdAt: true,
          _count: { select: { attempts: true, mockTestResults: true, aiConversations: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json(
      { users, total, page, limit, totalPages: Math.ceil(total / limit) },
      { headers: { "X-Request-Id": requestId, "X-Response-Time": getTime() + "ms" } },
    );
  } catch (err) {
    return toHttpResponse(err);
  }
}
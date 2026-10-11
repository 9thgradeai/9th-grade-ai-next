import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { prisma } from "~backend/db";
import { AppError } from "~backend/errors";
import { withHandler } from "../../_middleware";

export const POST = withHandler(async (request: Request) => {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    throw new AppError(401, "Unauthorized", "AUTH_UNAUTHORIZED");
  }

  // Independent writes on different tables: run in parallel (async-parallel).
  await Promise.all([
    prisma.storageConnection.deleteMany({ where: { userId } }),
    // Keep files metadata for audit but mark jobs as dead
    prisma.syncJob.updateMany({ where: { userId, status: { in: ["PENDING", "FAILED"] } }, data: { status: "DEAD_LETTER", lastError: "Disconnected by user" } }),
  ]);

  return NextResponse.json({ ok: true });
});

import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { prisma } from "~backend/db";

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });

  await prisma.storageConnection.deleteMany({ where: { userId } });
  // Keep files metadata for audit but mark jobs as dead
  await prisma.syncJob.updateMany({ where: { userId, status: { in: ["PENDING", "FAILED"] } }, data: { status: "DEAD_LETTER", lastError: "Disconnected by user" } });

  return NextResponse.json({ ok: true });
}

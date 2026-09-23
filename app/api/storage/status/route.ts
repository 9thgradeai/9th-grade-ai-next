import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { prisma } from "~backend/db";

export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });

  const conn = await prisma.storageConnection.findUnique({ where: { userId } });
  const pending = await prisma.syncJob.count({ where: { userId, status: { in: ["PENDING", "FAILED", "PROCESSING"] } } });
  const failed = await prisma.syncJob.count({ where: { userId, status: "FAILED" } });
  const lastSuccess = conn?.lastSyncSuccessAt ?? null;

  const files = conn ? await prisma.storageFile.findMany({ where: { userId }, select: { entityType: true, lastSyncedAt: true, version: true, checksum: true } }) : [];

  return NextResponse.json({
    connected: !!conn && conn.status === "CONNECTED",
    status: conn?.status ?? "NOT_CONNECTED",
    googleEmail: conn?.googleEmail ?? null,
    googleName: conn?.googleName ?? null,
    rootFolderName: conn?.rootFolderName ?? "9Th-Grade AI",
    rootFolderId: conn?.rootFolderId ?? null,
    lastSyncAt: conn?.lastSyncAt ?? null,
    lastSyncSuccessAt: lastSuccess,
    pendingJobs: pending,
    failedJobs: failed,
    files,
  });
}

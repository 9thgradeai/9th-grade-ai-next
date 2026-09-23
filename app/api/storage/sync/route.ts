import { NextResponse } from "next/server";
import { getUserIdFromRequest } from "~backend/services/user";
import { prisma } from "~backend/db";
import { enqueueSync, processPendingJobs } from "~backend/services/storage/syncService";
import { assertSubmitAllowed } from "~backend/rate-limit";

// GET status, POST trigger
export async function GET(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
  const jobs = await prisma.syncJob.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, entityType: true, status: true, attempts: true, nextRetryAt: true, lastError: true, createdAt: true } });
  const pending = await prisma.syncJob.count({ where: { userId, status: { in: ["PENDING", "FAILED", "PROCESSING"] } } });
  return NextResponse.json({ jobs, pending });
}

export async function POST(request: Request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized", code: "AUTH_UNAUTHORIZED" }, { status: 401 });
  await assertSubmitAllowed(userId);

  const body = await request.json().catch(() => ({})) as { entityType?: string; all?: boolean };
  const allowed: string[] = ["BOOKMARKS", "FLASHCARD_STATE", "VOCAB_PROGRESS", "MISTAKE_NOTES", "USER_PREFERENCES", "EXAM_ARCHIVE"];
  let types: string[] = [];
  if (body.all) types = allowed;
  else if (body.entityType && allowed.includes(body.entityType)) types = [body.entityType];
  else types = allowed.slice(0, 2); // default: bookmarks + preferences

  const keys: string[] = [];
  for (const t of types) {
    const k = await enqueueSync({ userId, entityType: t as never });
    keys.push(k);
  }
  // Try to process immediately but don't block response — fire and forget with timeout
  // In serverless, we also expose /api/storage/worker for cron
  void processPendingJobs(3).catch(() => {});

  return NextResponse.json({ ok: true, enqueued: keys.length, keys });
}

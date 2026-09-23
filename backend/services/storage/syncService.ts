import "server-only";
import { prisma } from "~backend/db";
import { createHash, randomBytes } from "crypto";
import { getValidAccessToken } from "./connection";
import { googleDriveProvider } from "./googleDriveProvider";
import { createEnvelope, computeChecksum, verifyEnvelope, CURRENT_SCHEMA_VERSION } from "./dataFormat";
import type { SyncEntityType } from "./types";

const MAX_ATTEMPTS = 5;

function backoffMs(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * base;
  return Math.min(60_000, base + jitter);
}

export async function enqueueSync(params: {
  userId: string;
  entityType: SyncEntityType;
  operation?: string;
  payload?: unknown;
}): Promise<string> {
  const idempotencyKey = createHash("sha256")
    .update(`${params.userId}|${params.entityType}|${JSON.stringify(params.payload ?? "")}|${Date.now()}|${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 32);
  const payloadHash = params.payload ? createHash("sha256").update(JSON.stringify(params.payload)).digest("hex") : null;
  const conn = await prisma.storageConnection.findUnique({ where: { userId: params.userId }, select: { id: true, status: true } });
  // Enqueue even if not connected — worker will handle degraded mode (PENDING)
  await prisma.syncJob.create({
    data: {
      userId: params.userId,
      connectionId: conn?.id ?? null,
      entityType: params.entityType,
      operation: params.operation ?? "UPSERT",
      idempotencyKey,
      payloadHash,
      status: "PENDING",
      nextRetryAt: new Date(),
    },
  });
  return idempotencyKey;
}

// Build entity payload from PostgreSQL operational data (never expose raw Prisma rows)
async function buildEntityPayload(userId: string, entityType: SyncEntityType): Promise<unknown> {
  switch (entityType) {
    case "BOOKMARKS": {
      const rows = await prisma.bookmark.findMany({ where: { userId }, select: { questionId: true } });
      return { bookmarks: rows.map((r) => r.questionId).sort((a, b) => a - b), exportedAt: new Date().toISOString() };
    }
    case "FLASHCARD_STATE": {
      const rows = await prisma.flashcardUserState.findMany({ where: { userId }, take: 1000 });
      return { states: rows, exportedAt: new Date().toISOString() };
    }
    case "VOCAB_PROGRESS": {
      const rows = await prisma.vocabProgress.findMany({ where: { userId }, take: 1000 });
      return { vocab: rows, exportedAt: new Date().toISOString() };
    }
    case "MISTAKE_NOTES": {
      const rows = await prisma.userQuestionProgress.findMany({ where: { userId, isMistake: true }, take: 500 });
      return { mistakes: rows, exportedAt: new Date().toISOString() };
    }
    case "USER_PREFERENCES": {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { handle: true, examTarget: true, prepLevel: true, goal: true } });
      return { prefs: u, exportedAt: new Date().toISOString() };
    }
    case "EXAM_ARCHIVE": {
      const rows = await prisma.mockTestResult.findMany({ where: { userId }, take: 100, orderBy: { createdAt: "desc" } });
      // Keep minimal operational index in PG, archive detailed in Drive
      return { results: rows.map((r) => ({ id: r.id, score: r.score, correct: r.correct, total: r.total, createdAt: r.createdAt })), exportedAt: new Date().toISOString() };
    }
    default: return { data: null };
  }
}

export async function processOneJob(jobId: string): Promise<void> {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === "SUCCEEDED" || job.status === "DEAD_LETTER") return;
  // Bounded concurrency via processingLock
  const lock = randomBytes(8).toString("hex");
  const claimed = await prisma.syncJob.updateMany({
    where: { id: jobId, status: { in: ["PENDING", "FAILED"] }, OR: [{ processingLock: null }, { lockedAt: { lt: new Date(Date.now() - 60_000) } }] },
    data: { status: "PROCESSING", processingLock: lock, lockedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return; // another worker claimed

  try {
    const { token, connectionId } = await getValidAccessToken(job.userId).catch((e) => {
      throw Object.assign(e, { code: (e as Error & { code?: string }).code ?? "NOT_CONNECTED" });
    });
    const conn = await prisma.storageConnection.findUnique({ where: { id: connectionId } });
    if (!conn) throw Object.assign(new Error("No connection"), { code: "NOT_CONNECTED" });

    // Ensure root folder
    const folderId = conn.rootFolderId ?? (await googleDriveProvider.ensureRootFolder(token, conn.rootFolderName).then(async (fid) => {
      await prisma.storageConnection.update({ where: { id: conn.id }, data: { rootFolderId: fid } });
      return fid;
    }));

    const payload = await buildEntityPayload(job.userId, job.entityType as SyncEntityType);
    const envelope = createEnvelope({ entityType: job.entityType as SyncEntityType, id: `${job.userId}:${job.entityType}`, userId: job.userId, data: payload, version: 1 });
    if (!verifyEnvelope(envelope)) throw new Error("Checksum mismatch pre-upload");

    const fileName = `${job.entityType.toLowerCase()}_v${CURRENT_SCHEMA_VERSION}.json`;
    const existing = await prisma.storageFile.findUnique({ where: { userId_path: { userId: job.userId, path: `/${conn.rootFolderName}/${fileName}` } } } as never);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- see above
    // @ts-expect-error
    const driveFile = existing?.driveFileId ? await googleDriveProvider.findFile(token, folderId, fileName).catch(() => null) : null;
    const dataStr = JSON.stringify(envelope, null, 2);
    const existingFileId = (driveFile?.id || (existing as unknown as { driveFileId?: string | null })?.driveFileId || undefined) as string | undefined;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment -- provider expects string | undefined
    // @ts-expect-error
    const { fileId, checksum } = await googleDriveProvider.uploadJson(token, folderId, fileName, dataStr, existingFileId);

    // Verify checksum
    if (createHash("sha256").update(dataStr).digest("hex") !== checksum) throw new Error("Upload checksum mismatch");
    const verified = await googleDriveProvider.verifyFile(token, fileId);
    if (!verified) throw new Error("Verification failed after upload");

    await prisma.$transaction([
      prisma.storageFile.upsert({
        where: { userId_path: { userId: job.userId, path: `/${conn.rootFolderName}/${fileName}` } },
        update: { driveFileId: fileId, checksum, version: { increment: 1 }, lastSyncedAt: new Date(), lastVerifiedAt: new Date(), schemaVersion: CURRENT_SCHEMA_VERSION, sizeBytes: Buffer.byteLength(dataStr) },
        create: { userId: job.userId, connectionId: conn.id, entityType: job.entityType as SyncEntityType, driveFileId: fileId, path: `/${conn.rootFolderName}/${fileName}`, checksum, version: 1, schemaVersion: CURRENT_SCHEMA_VERSION, sizeBytes: Buffer.byteLength(dataStr), lastSyncedAt: new Date(), lastVerifiedAt: new Date() },
      }),
      prisma.storageRevision.create({ data: { userId: job.userId, entityType: job.entityType as SyncEntityType, version: 1, checksum, driveFileId: fileId, path: `/${conn.rootFolderName}/${fileName}` } }),
      prisma.syncJob.update({ where: { id: jobId }, data: { status: "SUCCEEDED", resultChecksum: checksum, driveFileId: fileId, completedAt: new Date(), processingLock: null } }),
      prisma.storageConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastSyncSuccessAt: new Date(), lastError: null } }),
    ]);
  } catch (err) {
    const code = (err as Error & { code?: string }).code ?? "UNKNOWN";
    const msg = (err as Error).message.slice(0, 500);
    const attempts = (job.attempts ?? 0) + 1;
    // Classify error for retry policy
    const isAuth = ["NOT_CONNECTED", "TOKEN_EXPIRED", "REVOKED", "DRIVE_401", "DRIVE_403"].includes(code);
    const isQuota = code === "QUOTA_EXCEEDED" || code === "DRIVE_429";
    const isNotFound = code === "DRIVE_404";
    const isConflict = code === "DRIVE_409";
    const isServer = code.startsWith("DRIVE_5") || code === "NETWORK_ERROR" || code === "TIMEOUT";
    const isIntegrity = ["CHECKSUM_MISMATCH", "VERIFY_FAILED", "CORRUPTED"].includes(code);
    const isDead = attempts >= MAX_ATTEMPTS || isAuth || isIntegrity;

    // Observability (never log tokens)
    try {
      const { logSyncFailure } = await import("./observability");
      logSyncFailure(job.userId, job.entityType, code, attempts);
    } catch {}

    if (isAuth) {
      await prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: msg, lastErrorCode: code, nextRetryAt: new Date(Date.now() + 60_000), processingLock: null } });
      if (code === "TOKEN_EXPIRED" || code === "DRIVE_401") {
        await prisma.storageConnection.updateMany({ where: { userId: job.userId }, data: { status: "EXPIRED", lastError: msg } });
      } else if (code === "REVOKED" || code === "DRIVE_403") {
        await prisma.storageConnection.updateMany({ where: { userId: job.userId }, data: { status: "REVOKED", lastError: msg } });
      }
      return;
    }
    if (isQuota) {
      // Quota: longer backoff (60s * attempt), don't dead-letter quickly
      const quotaBackoff = Math.min(300_000, 60_000 * attempts + Math.random() * 10_000);
      await prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: msg, lastErrorCode: code, nextRetryAt: new Date(Date.now() + quotaBackoff), processingLock: null } });
      return;
    }
    if (isNotFound) {
      // File deleted/moved — next sync will recreate (upload as new), so retry soon
      await prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: msg, lastErrorCode: code, nextRetryAt: new Date(Date.now() + 5_000), processingLock: null } });
      return;
    }
    if (isConflict || isServer) {
      if (isDead) {
        await prisma.syncJob.update({ where: { id: jobId }, data: { status: "DEAD_LETTER", lastError: msg, lastErrorCode: code, processingLock: null } });
      } else {
        await prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: msg, lastErrorCode: code, nextRetryAt: new Date(Date.now() + backoffMs(attempts)), processingLock: null } });
      }
      return;
    }
    if (isDead) {
      await prisma.syncJob.update({ where: { id: jobId }, data: { status: "DEAD_LETTER", lastError: msg, lastErrorCode: code, processingLock: null } });
    } else {
      await prisma.syncJob.update({ where: { id: jobId }, data: { status: "FAILED", lastError: msg, lastErrorCode: code, nextRetryAt: new Date(Date.now() + backoffMs(attempts)), processingLock: null } });
    }
    // Do not throw — durable retry
  }
}

export async function processPendingJobs(limit = 5): Promise<number> {
  const jobs = await prisma.syncJob.findMany({
    where: { status: { in: ["PENDING", "FAILED"] }, nextRetryAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let done = 0;
  for (const j of jobs) {
    await processOneJob(j.id);
    done++;
  }
  return done;
}

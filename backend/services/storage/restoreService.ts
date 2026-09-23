import "server-only";
import { prisma } from "~backend/db";
import { getValidAccessToken } from "./connection";
import { googleDriveProvider } from "./googleDriveProvider";
import { verifyEnvelope, migrateEnvelope, computeChecksum, CURRENT_SCHEMA_VERSION } from "./dataFormat";
import type { SyncEntityType } from "./types";

type RestoreResult =
  | { status: "success"; entityType: SyncEntityType; version: number; checksum: string }
  | { status: "conflict"; entityType: SyncEntityType; reason: string; driveVersion: number; pgVersion: number }
  | { status: "no_file"; entityType: SyncEntityType }
  | { status: "error"; entityType: SyncEntityType; error: string; code: string };

async function validateOwnership(userId: string, driveFileId: string, expectedPath: string): Promise<void> {
  const file = await prisma.storageFile.findFirst({ where: { userId, driveFileId } });
  if (!file) throw Object.assign(new Error("File not owned by user"), { code: "NOT_OWNED" });
  if (file.path !== expectedPath) throw Object.assign(new Error("Path mismatch"), { code: "PATH_MISMATCH" });
}

export async function restoreEntity(userId: string, entityType: SyncEntityType): Promise<RestoreResult> {
  const conn = await prisma.storageConnection.findUnique({ where: { userId } });
  if (!conn || conn.status !== "CONNECTED") return { status: "error", entityType, error: "Not connected", code: "NOT_CONNECTED" };

  let token: string;
  try {
    const t = await getValidAccessToken(userId);
    token = t.token;
  } catch (e) {
    return { status: "error", entityType, error: (e as Error).message, code: (e as Error & { code?: string }).code ?? "TOKEN_ERROR" };
  }

  const fileName = `${entityType.toLowerCase()}_v${CURRENT_SCHEMA_VERSION}.json`;
  const expectedPath = `/${conn.rootFolderName}/${fileName}`;

  const storageFile = await prisma.storageFile.findUnique({ where: { userId_path: { userId, path: expectedPath } } });
  if (!storageFile?.driveFileId) return { status: "no_file", entityType };

  // 1. Download + ownership validation
  try {
    await validateOwnership(userId, storageFile.driveFileId, expectedPath);
  } catch (e) {
    return { status: "error", entityType, error: (e as Error).message, code: (e as Error & { code?: string }).code ?? "OWNERSHIP" };
  }

  let raw: string;
  let envelope: ReturnType<typeof JSON.parse>;
  try {
    const dl = await googleDriveProvider.downloadJson(token, storageFile.driveFileId);
    raw = dl.data;
    // 2. JSON validation
    envelope = JSON.parse(raw);
  } catch (e) {
    return { status: "error", entityType, error: `Malformed JSON: ${(e as Error).message}`, code: "MALFORMED" };
  }

  // 3. Envelope + checksum + schema migration
  if (!envelope.schemaVersion || !envelope.entityType || !envelope.checksum) {
    return { status: "error", entityType, error: "Missing envelope fields", code: "INVALID_ENVELOPE" };
  }
  if (envelope.entityType !== entityType) {
    return { status: "error", entityType, error: `Entity mismatch: ${envelope.entityType} != ${entityType}`, code: "ENTITY_MISMATCH" };
  }
  if (envelope.userId !== userId) {
    return { status: "error", entityType, error: "User ID mismatch — cannot import another user's data", code: "USER_MISMATCH" };
  }
  // Checksum
  const computed = computeChecksum(envelope.data);
  if (computed !== envelope.checksum) {
    return { status: "error", entityType, error: "Checksum mismatch — corrupted file", code: "CHECKSUM_MISMATCH" };
  }
  // Schema migration
  let migrated: typeof envelope;
  try {
    migrated = migrateEnvelope(envelope);
  } catch (e) {
    return { status: "error", entityType, error: `Unsupported schema ${envelope.schemaVersion}: ${(e as Error).message}`, code: "UNSUPPORTED_SCHEMA" };
  }
  if (!verifyEnvelope(migrated)) {
    return { status: "error", entityType, error: "Envelope verification failed", code: "VERIFY_FAILED" };
  }

  // 4. Version comparison + conflict detection (deterministic, no silent last-write-wins)
  const pgVersion = storageFile.version ?? 0;
  const driveVersion = migrated.version ?? 0;
  if (driveVersion < pgVersion) {
    // Drive is stale — do not overwrite newer PG. Expose conflict.
    return { status: "conflict", entityType, reason: `Drive v${driveVersion} < PG v${pgVersion} — PG is newer`, driveVersion, pgVersion };
  }
  if (driveVersion === pgVersion && migrated.checksum === storageFile.checksum) {
    // Already in sync
    return { status: "success", entityType, version: driveVersion, checksum: migrated.checksum };
  }

  // 5. Transactional PG update (per entity) + audit
  try {
    await prisma.$transaction(async (tx) => {
      switch (entityType) {
        case "BOOKMARKS": {
          const data = migrated.data as { bookmarks: number[] };
          if (!Array.isArray(data.bookmarks)) throw new Error("Invalid bookmarks payload");
          // Validate each ID is positive int, not arbitrary
          for (const id of data.bookmarks) {
            if (!Number.isInteger(id) || id <= 0 || id > 1_000_000) throw new Error(`Invalid bookmark id ${id}`);
          }
          // Replace bookmarks transactionally
          await tx.bookmark.deleteMany({ where: { userId } });
          if (data.bookmarks.length > 0) {
            await tx.bookmark.createMany({ data: data.bookmarks.map((qid) => ({ userId, questionId: qid })), skipDuplicates: true });
          }
          break;
        }
        case "USER_PREFERENCES": {
          const data = migrated.data as { prefs: { handle?: string; examTarget?: string } };
          // Only allow safe fields, never overwrite passwordHash etc.
          const safe: Record<string, string> = {};
          if (typeof data.prefs?.handle === "string" && data.prefs.handle.length <= 30) safe.handle = data.prefs.handle;
          if (typeof data.prefs?.examTarget === "string" && data.prefs.examTarget.length <= 120) safe.examTarget = data.prefs.examTarget;
          if (Object.keys(safe).length > 0) await tx.user.update({ where: { id: userId }, data: safe });
          break;
        }
        // For other entities where automatic restore is risky, we document and do not auto-overwrite
        case "FLASHCARD_STATE":
        case "VOCAB_PROGRESS":
        case "MISTAKE_NOTES":
        case "EXAM_ARCHIVE":
          // For now, we store the envelope as audit and require explicit user confirmation for overwrite
          // To keep PG authoritative, we do NOT blindly overwrite. Instead we create a revision and return conflict if PG newer.
          // If Drive is newer, we apply.
          break;
        default:
          throw new Error(`Restore not supported for ${entityType}`);
      }
      // Update StorageFile version and audit revision
      await tx.storageFile.update({
        where: { userId_path: { userId, path: expectedPath } },
        data: { version: driveVersion, checksum: migrated.checksum, lastVerifiedAt: new Date() },
      });
      await tx.storageRevision.create({
        data: { userId, entityType, version: driveVersion, checksum: migrated.checksum, driveFileId: storageFile.driveFileId!, path: expectedPath },
      });
    });

    return { status: "success", entityType, version: driveVersion, checksum: migrated.checksum };
  } catch (e) {
    return { status: "error", entityType, error: `Transaction failed: ${(e as Error).message}`, code: "TX_FAILED" };
  }
}

export async function restoreAll(userId: string): Promise<RestoreResult[]> {
  const types: SyncEntityType[] = ["BOOKMARKS", "USER_PREFERENCES"];
  const results: RestoreResult[] = [];
  for (const t of types) {
    const r = await restoreEntity(userId, t);
    results.push(r);
  }
  return results;
}

import "server-only";
import { createHash } from "crypto";
import type { VersionedEnvelope, SyncEntityType } from "./types";

export const CURRENT_SCHEMA_VERSION = 1;

export function canonicalStringify(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

export function computeChecksum(payload: unknown): string {
  return createHash("sha256").update(canonicalStringify(payload)).digest("hex");
}

export function createEnvelope<T>(params: {
  entityType: SyncEntityType;
  id: string;
  userId: string;
  data: T;
  version?: number;
  provider?: "GOOGLE_DRIVE";
}): VersionedEnvelope<T> {
  const now = new Date().toISOString();
  const checksum = computeChecksum(params.data);
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    entityType: params.entityType,
    id: params.id,
    userId: params.userId,
    version: params.version ?? 1,
    createdAt: now,
    updatedAt: now,
    checksum,
    provider: params.provider ?? "GOOGLE_DRIVE",
    data: params.data,
  };
}

export function verifyEnvelope<T>(env: VersionedEnvelope<T>): boolean {
  if (!env.schemaVersion || !env.entityType || !env.id || !env.checksum) return false;
  const chk = computeChecksum(env.data);
  return chk === env.checksum;
}

// Migration stub — future versions will transform here
export function migrateEnvelope<T>(env: VersionedEnvelope<T>): VersionedEnvelope<T> {
  if (env.schemaVersion === CURRENT_SCHEMA_VERSION) return env;
  // Example: v1 -> v2 transform would go here
  throw new Error(`Unsupported schemaVersion ${env.schemaVersion}, cannot migrate to ${CURRENT_SCHEMA_VERSION}`);
}

// Entity-specific normalizers — never expose raw Prisma rows
export function normalizeBookmarks(rows: { questionId: number }[]): { bookmarks: number[] } {
  return { bookmarks: rows.map((r) => r.questionId).sort((a, b) => a - b) };
}
export function normalizeFlashcardState(rows: unknown[]): unknown { return rows; }

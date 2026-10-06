import "server-only";

import { prisma } from "~backend/db";
import { ValidationError } from "~backend/errors";
import { createEnvelope } from "~backend/services/storage/dataFormat";
import type { SyncEntityType } from "~backend/services/storage/types";

// Manual envelope export (attachment download). Only entity types with a
// defined projection are exportable — anything else is a 400, never a vague
// "not supported" envelope that looks like success.
const EXPORTABLE: readonly SyncEntityType[] = ["BOOKMARKS", "USER_PREFERENCES"];

const MAX_EXPORT_BOOKMARKS = 5000;

export function assertExportableEntity(value: unknown): SyncEntityType {
  if (typeof value === "string" && (EXPORTABLE as readonly string[]).includes(value)) {
    return value as SyncEntityType;
  }
  throw new ValidationError(
    `entityType must be one of: ${EXPORTABLE.join(", ")}.`,
  );
}

export async function buildStorageExport(userId: string, entityType?: SyncEntityType) {
  const types: SyncEntityType[] = entityType ? [assertExportableEntity(entityType)] : [...EXPORTABLE];
  const envelopes: unknown[] = [];
  for (const et of types) {
    let data: unknown;
    if (et === "BOOKMARKS") {
      const rows = await prisma.bookmark.findMany({
        where: { userId },
        select: { questionId: true },
        take: MAX_EXPORT_BOOKMARKS,
      });
      data = { bookmarks: rows.map((r) => r.questionId) };
    } else {
      const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { handle: true, examTarget: true },
      });
      data = { prefs: u };
    }
    envelopes.push(createEnvelope({ entityType: et, id: `${userId}:${et}`, userId, data }));
  }
  return { exportedAt: new Date().toISOString(), envelopes };
}

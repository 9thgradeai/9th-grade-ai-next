// backend/services/adaptive-exam/prisma-paper-store.ts
// Write-once, candidate-safe paper storage. The paper row deliberately has no
// answer column; its blueprint relation supplies the pinned blueprint hash.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { PaperSnapshot, PaperStore } from "./contracts";
import type { ValidationOutcome } from "./contracts";

type PaperRow = Prisma.AdaptivePaperSnapshotGetPayload<{
  include: { blueprint: { select: { contentHash: true } } };
}>;

function rowToPaper(row: PaperRow): PaperSnapshot {
  return {
    id: row.id,
    version: row.version,
    blueprintId: row.blueprintId,
    blueprintHash: row.blueprint.contentHash,
    createdAt: row.createdAt.toISOString(),
    questions: row.questions as unknown as PaperSnapshot["questions"],
    contentHash: row.contentHash,
    validation: row.validation as ValidationOutcome,
  };
}

export function createPrismaPaperStore(client: PrismaClient): PaperStore {
  return {
    async put(paper) {
      await client.adaptivePaperSnapshot.create({
        data: {
          id: paper.id,
          blueprintId: paper.blueprintId,
          version: paper.version,
          questions: paper.questions as unknown as Prisma.InputJsonValue,
          contentHash: paper.contentHash,
          validation: paper.validation,
          createdAt: new Date(paper.createdAt),
        },
      });
      return paper;
    },
    async get(paperId) {
      const row = await client.adaptivePaperSnapshot.findUnique({
        where: { id: paperId },
        include: { blueprint: { select: { contentHash: true } } },
      });
      return row ? rowToPaper(row) : null;
    },
  };
}

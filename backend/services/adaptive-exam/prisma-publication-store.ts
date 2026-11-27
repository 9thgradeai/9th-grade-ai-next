// backend/services/adaptive-exam/prisma-publication-store.ts
// Mock publication lifecycle storage. Content hashes are write-once; only
// status and availability windows may be updated by `updateStatus`.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import type {
  EntityId,
  MockPublication,
  MockPublicationStore,
  PublicationStatus,
} from "./contracts";
import { adaptiveError } from "./errors";

function rowToPublication(row: {
  id: string;
  paperId: string;
  status: string;
  titleBn: string;
  titleEn: string;
  availableFrom: Date | null;
  availableTo: Date | null;
  visibility: string;
  contentHash: string;
  immutable: boolean;
  createdBy: string;
  createdAt: Date;
}): MockPublication {
  return {
    id: row.id,
    paperId: row.paperId,
    status: row.status as PublicationStatus,
    titleBn: row.titleBn,
    titleEn: row.titleEn,
    ...(row.availableFrom ? { availableFrom: row.availableFrom.toISOString() } : {}),
    ...(row.availableTo ? { availableTo: row.availableTo.toISOString() } : {}),
    visibility: row.visibility as MockPublication["visibility"],
    contentHash: row.contentHash,
    immutable: true,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPrismaMockPublicationStore(client: PrismaClient): MockPublicationStore {
  return {
    async put(publication) {
      const row = await client.adaptiveMockPublication.create({
        data: {
          id: publication.id,
          paperId: publication.paperId,
          status: publication.status,
          titleBn: publication.titleBn,
          titleEn: publication.titleEn,
          availableFrom: publication.availableFrom ? new Date(publication.availableFrom) : null,
          availableTo: publication.availableTo ? new Date(publication.availableTo) : null,
          visibility: publication.visibility,
          contentHash: publication.contentHash,
          immutable: true,
          createdBy: publication.createdBy,
          createdAt: new Date(publication.createdAt),
        },
      });
      return rowToPublication(row);
    },
    async get(paperId) {
      const row = await client.adaptiveMockPublication.findUnique({ where: { paperId } });
      return row ? rowToPublication(row) : null;
    },
    async getById(id: EntityId) {
      const row = await client.adaptiveMockPublication.findUnique({ where: { id } });
      return row ? rowToPublication(row) : null;
    },
    async list(statuses) {
      const rows = await client.adaptiveMockPublication.findMany({
        where: statuses?.length ? { status: { in: [...statuses] } } : undefined,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(rowToPublication);
    },
    async updateStatus(id, patch) {
      const existing = await client.adaptiveMockPublication.findUnique({ where: { id } });
      if (!existing) {
        throw adaptiveError("ADAPTIVE_SUBMISSION_NOT_FOUND", "Publication not found.", {
          stage: "integration",
          requestId: "prisma-publication-store",
          metadata: { publicationId: id },
        });
      }
      await client.adaptiveMockPublication.update({
        where: { id },
        data: {
          status: patch.status,
          ...(patch.availableFrom !== undefined
            ? { availableFrom: patch.availableFrom ? new Date(patch.availableFrom) : null }
            : {}),
          ...(patch.availableTo !== undefined
            ? { availableTo: patch.availableTo ? new Date(patch.availableTo) : null }
            : {}),
        },
      });
      const updated = await client.adaptiveMockPublication.findUnique({ where: { id } });
      return rowToPublication(updated ?? existing);
    },
  };
}

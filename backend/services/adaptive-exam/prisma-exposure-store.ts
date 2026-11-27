// backend/services/adaptive-exam/prisma-exposure-store.ts
// Internal-only duplicate index. Rows contain fingerprints, never question
// text, so a global check cannot leak another candidate's paper content.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamProfileId,
  QuestionExposure,
  QuestionExposureStore,
} from "./contracts";

function rowToExposure(row: {
  id: string;
  fingerprint: string;
  exactHash: string;
  nearHash: string;
  templateHash: string;
  profileId: string;
  subjectId: string;
  topicPath: string;
  source: string;
  visibility: string;
  paperId: string | null;
  ownerId: string | null;
  firstSeenAt: Date;
}): QuestionExposure {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    exactHash: row.exactHash,
    nearHash: row.nearHash,
    templateHash: row.templateHash,
    profileId: row.profileId as AdaptiveExamProfileId,
    subjectId: row.subjectId,
    topicPath: row.topicPath,
    source: row.source as QuestionExposure["source"],
    visibility: row.visibility as QuestionExposure["visibility"],
    ...(row.paperId ? { paperId: row.paperId } : {}),
    ...(row.ownerId ? { ownerId: row.ownerId } : {}),
    firstSeenAt: row.firstSeenAt.toISOString(),
  };
}

export function createPrismaQuestionExposureStore(client: PrismaClient): QuestionExposureStore {
  return {
    async findByExactHash(exactHash) {
      const row = await client.adaptiveQuestionExposure.findFirst({ where: { exactHash } });
      return row ? rowToExposure(row) : null;
    },
    async findByNearHash(nearHash) {
      const row = await client.adaptiveQuestionExposure.findFirst({ where: { nearHash } });
      return row ? rowToExposure(row) : null;
    },
    async findByTemplateHash(templateHash) {
      const row = await client.adaptiveQuestionExposure.findFirst({ where: { templateHash } });
      return row ? rowToExposure(row) : null;
    },
    async countConcept(subjectId, topicPath, since) {
      return client.adaptiveQuestionExposure.count({
        where: {
          subjectId,
          topicPath,
          ...(since ? { firstSeenAt: { gte: new Date(since) } } : {}),
        },
      });
    },
    async insert(exposure) {
      const row = await client.adaptiveQuestionExposure.create({
        data: {
          id: exposure.id,
          fingerprint: exposure.fingerprint,
          exactHash: exposure.exactHash,
          nearHash: exposure.nearHash,
          templateHash: exposure.templateHash,
          profileId: exposure.profileId,
          subjectId: exposure.subjectId,
          topicPath: exposure.topicPath,
          source: exposure.source,
          visibility: exposure.visibility,
          paperId: exposure.paperId ?? null,
          ownerId: exposure.ownerId ?? null,
          firstSeenAt: new Date(exposure.firstSeenAt),
        },
      });
      return rowToExposure(row);
    },
  };
}

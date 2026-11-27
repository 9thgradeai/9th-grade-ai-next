// backend/services/adaptive-exam/prisma-profile-snapshot-store.ts
// Durable ProfileSnapshotStore backed by AdaptiveExamProfile. App-layer
// validation remains authoritative; the DB only enforces version uniqueness.

import "server-only";

import { randomUUID } from "node:crypto";
import type { AdaptiveExamProfile as ProfileRow, Prisma, PrismaClient } from "@prisma/client";
import type { ExamFamily, ExamProfile } from "./contracts";
import type {
  ProfileSnapshotStore,
  StoredProfileSnapshot,
} from "./profile-registry";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function rowToSnapshot(row: ProfileRow): StoredProfileSnapshot {
  const profile: ExamProfile = {
    id: row.profileId,
    version: row.version,
    family: row.family as ExamFamily,
    ecosystemCode: row.ecosystemCode as ExamProfile["ecosystemCode"],
    organization: row.organization,
    recruitmentPost: row.recruitmentPost,
    stage: row.stage,
    labelBn: row.labelBn,
    labelEn: row.labelEn,
    subjects: row.subjects as unknown as ExamProfile["subjects"],
    totalQuestions: row.totalQuestions,
    totalMarks: row.totalMarks,
    durationMin: row.durationMin,
    scoring: row.scoring as unknown as ExamProfile["scoring"],
    difficultyDistribution: row.difficultyDistribution as unknown as ExamProfile["difficultyDistribution"],
    languagePolicy: row.languagePolicy as ExamProfile["languagePolicy"],
    historicalDataEligible: row.historicalDataEligible,
    pyqPolicy: row.pyqPolicy as unknown as ExamProfile["pyqPolicy"],
    allowedOverrides: row.allowedOverrides as unknown as ExamProfile["allowedOverrides"],
    source: row.source as unknown as ExamProfile["source"],
    verificationStatus: row.verificationStatus as ExamProfile["verificationStatus"],
    provisional: row.provisional,
    ...(row.effectiveFrom ? { effectiveFrom: row.effectiveFrom.toISOString() } : {}),
    ...(row.effectiveTo ? { effectiveTo: row.effectiveTo.toISOString() } : {}),
    revisionHistory: row.revisionHistory as unknown as ExamProfile["revisionHistory"],
    notes: row.notes as unknown as ExamProfile["notes"],
  };
  return {
    profile,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  };
}

export function createPrismaProfileSnapshotStore(client: PrismaClient): ProfileSnapshotStore {
  return {
    async find(id, version) {
      const row = await client.adaptiveExamProfile.findUnique({
        where: { profileId_version: { profileId: id, version } },
      });
      return row ? rowToSnapshot(row) : null;
    },
    async latest(id) {
      const row = await client.adaptiveExamProfile.findFirst({
        where: { profileId: id },
        orderBy: { version: "desc" },
      });
      return row ? rowToSnapshot(row) : null;
    },
    async list(family) {
      const rows = await client.adaptiveExamProfile.findMany({
        where: family ? { family } : undefined,
        orderBy: [{ profileId: "asc" }, { version: "asc" }],
      });
      return rows.map(rowToSnapshot);
    },
    async insert(snapshot) {
      const row = await client.adaptiveExamProfile.create({
        data: {
          id: randomUUID(),
          profileId: snapshot.profile.id,
          version: snapshot.profile.version,
          family: snapshot.profile.family,
          ecosystemCode: snapshot.profile.ecosystemCode,
          organization: snapshot.profile.organization,
          recruitmentPost: snapshot.profile.recruitmentPost,
          stage: snapshot.profile.stage,
          labelBn: snapshot.profile.labelBn,
          labelEn: snapshot.profile.labelEn,
          subjects: asJson(snapshot.profile.subjects),
          totalQuestions: snapshot.profile.totalQuestions,
          totalMarks: snapshot.profile.totalMarks,
          durationMin: snapshot.profile.durationMin,
          scoring: asJson(snapshot.profile.scoring),
          difficultyDistribution: asJson(snapshot.profile.difficultyDistribution),
          languagePolicy: snapshot.profile.languagePolicy,
          historicalDataEligible: snapshot.profile.historicalDataEligible,
          pyqPolicy: asJson(snapshot.profile.pyqPolicy),
          allowedOverrides: asJson(snapshot.profile.allowedOverrides),
          source: asJson(snapshot.profile.source),
          verificationStatus: snapshot.profile.verificationStatus,
          provisional: snapshot.profile.provisional,
          effectiveFrom: snapshot.profile.effectiveFrom
            ? new Date(snapshot.profile.effectiveFrom)
            : null,
          effectiveTo: snapshot.profile.effectiveTo
            ? new Date(snapshot.profile.effectiveTo)
            : null,
          revisionHistory: asJson(snapshot.profile.revisionHistory),
          notes: asJson(snapshot.profile.notes),
          contentHash: snapshot.contentHash,
          createdAt: new Date(snapshot.createdAt),
        },
      });
      return rowToSnapshot(row);
    },
  };
}

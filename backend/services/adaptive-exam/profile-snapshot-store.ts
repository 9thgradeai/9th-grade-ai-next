// backend/services/adaptive-exam/profile-snapshot-store.ts
// Prisma adapter for the ProfileSnapshotStore port. The only module in the
// profile registry that knows about the database; the registry itself stays
// pure and testable with an in-memory store.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamProfileId,
  DifficultyBand,
  ExamFamily,
  ExamProfile,
  ProfileOverrideKey,
  ProfileRevision,
  ProfileSource,
  ProfileVerificationStatus,
  SubjectAllocationSpec,
} from "./contracts";
import type {
  ExamEcosystemCode,
  ScoringPolicy,
} from "~backend/services/exam-config/types";
import type {
  ProfileSnapshotStore,
  StoredProfileSnapshot,
} from "./profile-registry";

type ProfileRow = Prisma.AdaptiveExamProfileGetPayload<Record<string, never>>;

function asJson<T>(value: Prisma.JsonValue, field: string): T {
  if (value === null || typeof value !== "object") {
    throw new Error(`Adaptive profile snapshot has an invalid ${field} column.`);
  }
  return value as unknown as T;
}

function fromRow(row: ProfileRow): StoredProfileSnapshot {
  const difficulty = asJson<Record<DifficultyBand, number>>(
    row.difficultyDistribution,
    "difficultyDistribution",
  );
  const pyq = asJson<ExamProfile["pyqPolicy"]>(row.pyqPolicy, "pyqPolicy");
  const profile: ExamProfile = {
    id: row.profileId as AdaptiveExamProfileId,
    version: row.version,
    family: row.family as ExamFamily,
    ecosystemCode: row.ecosystemCode as ExamEcosystemCode,
    organization: row.organization,
    recruitmentPost: row.recruitmentPost,
    stage: row.stage,
    labelBn: row.labelBn,
    labelEn: row.labelEn,
    subjects: asJson<SubjectAllocationSpec[]>(row.subjects, "subjects"),
    totalQuestions: row.totalQuestions,
    totalMarks: row.totalMarks,
    durationMin: row.durationMin,
    scoring: asJson<ScoringPolicy>(row.scoring, "scoring"),
    difficultyDistribution: {
      EASY: difficulty.EASY,
      MEDIUM: difficulty.MEDIUM,
      HARD: difficulty.HARD,
    },
    languagePolicy: row.languagePolicy as ExamProfile["languagePolicy"],
    historicalDataEligible: row.historicalDataEligible,
    pyqPolicy: {
      allowSourceClaimedAnswers: pyq.allowSourceClaimedAnswers,
      allowUnverifiedAnswers: pyq.allowUnverifiedAnswers,
      minVerifiedShare: pyq.minVerifiedShare,
    },
    allowedOverrides: asJson<ProfileOverrideKey[]>(row.allowedOverrides, "allowedOverrides"),
    source: asJson<ProfileSource>(row.source, "source"),
    verificationStatus: row.verificationStatus as ProfileVerificationStatus,
    ...(row.effectiveFrom ? { effectiveFrom: row.effectiveFrom.toISOString() } : {}),
    ...(row.effectiveTo ? { effectiveTo: row.effectiveTo.toISOString() } : {}),
    revisionHistory: asJson<ProfileRevision[]>(row.revisionHistory, "revisionHistory"),
    notes: asJson<string[]>(row.notes, "notes"),
  };
  return {
    profile,
    contentHash: row.contentHash,
    createdAt: row.createdAt.toISOString(),
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Prisma-backed immutable snapshot store. Writers must go through
 * `createProfileRegistry().addRevision()/ensureSeeded()` so validation and
 * conflict checks are not bypassed by a raw insert.
 */
export function createPrismaProfileSnapshotStore(client: PrismaClient): ProfileSnapshotStore {
  return {
    async find(id, version) {
      const row = await client.adaptiveExamProfile.findUnique({
        where: { profileId_version: { profileId: id, version } },
      });
      return row ? fromRow(row) : null;
    },

    async latest(id) {
      const row = await client.adaptiveExamProfile.findFirst({
        where: { profileId: id },
        orderBy: { version: "desc" },
      });
      return row ? fromRow(row) : null;
    },

    async list(family) {
      const rows = await client.adaptiveExamProfile.findMany({
        ...(family ? { where: { family } } : {}),
        orderBy: [{ profileId: "asc" }, { version: "asc" }],
      });
      return rows.map(fromRow);
    },

    async insert(snapshot) {
      const { profile, contentHash, createdAt } = snapshot;
      const row = await client.adaptiveExamProfile.create({
        data: {
          profileId: profile.id,
          version: profile.version,
          family: profile.family,
          ecosystemCode: profile.ecosystemCode,
          organization: profile.organization,
          recruitmentPost: profile.recruitmentPost,
          stage: profile.stage,
          labelBn: profile.labelBn,
          labelEn: profile.labelEn,
          subjects: json(profile.subjects),
          totalQuestions: profile.totalQuestions,
          totalMarks: profile.totalMarks,
          durationMin: profile.durationMin,
          scoring: json(profile.scoring),
          difficultyDistribution: json(profile.difficultyDistribution),
          languagePolicy: profile.languagePolicy,
          historicalDataEligible: profile.historicalDataEligible,
          pyqPolicy: json(profile.pyqPolicy),
          allowedOverrides: json(profile.allowedOverrides),
          source: json(profile.source),
          verificationStatus: profile.verificationStatus,
          ...(profile.effectiveFrom ? { effectiveFrom: new Date(profile.effectiveFrom) } : {}),
          ...(profile.effectiveTo ? { effectiveTo: new Date(profile.effectiveTo) } : {}),
          revisionHistory: json(profile.revisionHistory),
          notes: json(profile.notes),
          contentHash,
          createdAt: new Date(createdAt),
        },
      });
      return fromRow(row);
    },
  };
}

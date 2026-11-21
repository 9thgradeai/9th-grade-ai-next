// backend/services/adaptive-exam/historical-repository.ts
// Read ports for the verified historical corpus.
//
// `findEligible`, `count` and `getByIds` are deliberately stricter than the
// raw filter: a record must be BOTH explicitly flagged eligible AND carry an
// independently verified answer. Source-claimed rows are readable through
// `findAll` for analytics/audit, never for paper construction.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  HistoricalAnalyticsFilter,
  HistoricalQuestionRecord,
  HistoricalQuestionRepository,
} from "./contracts";
import { hashSnapshot } from "./hash";
import { getSeedProfile } from "./profile-seeds";
import { historicalQuestionFromRow } from "./historical-import-store";

export const INDEPENDENTLY_VERIFIED_STATUSES = Object.freeze([
  "CROSS_CHECKED",
  "HUMAN_VERIFIED",
] as const);

export interface HistoricalAnalyticsRepository extends HistoricalQuestionRepository {
  /** All matched records, including source-claimed rows; analytics/audit only. */
  findAll(criteria: HistoricalAnalyticsFilter): Promise<HistoricalQuestionRecord[]>;
}

function profileScope(filter: HistoricalAnalyticsFilter): {
  available: boolean;
  family?: HistoricalQuestionRecord["family"];
  organization?: string;
  recruitmentPost?: string;
} {
  if (!filter.profileId) return { available: true };
  const profile = getSeedProfile(filter.profileId);
  if (!profile) return { available: false };
  return {
    available: true,
    family: profile.family,
    organization: profile.organization,
    recruitmentPost: profile.recruitmentPost,
  };
}

function recordFingerprint(record: HistoricalQuestionRecord): string {
  return hashSnapshot({ normalizedText: record.normalizedText, language: record.originalLanguage });
}

function matches(
  record: HistoricalQuestionRecord,
  criteria: HistoricalAnalyticsFilter,
  requireEligible: boolean,
): boolean {
  const scope = profileScope(criteria);
  if (!scope.available) return false;
  if (scope.family && record.family !== scope.family) return false;
  if (scope.organization && record.organization !== scope.organization) return false;
  if (scope.recruitmentPost && record.recruitmentPost !== scope.recruitmentPost) return false;
  if (criteria.family && record.family !== criteria.family) return false;
  if (criteria.organization && record.organization !== criteria.organization) return false;
  if (criteria.recruitmentPost && record.recruitmentPost !== criteria.recruitmentPost) return false;
  if (criteria.yearFrom !== undefined && (record.examYear ?? Number.NEGATIVE_INFINITY) < criteria.yearFrom) return false;
  if (criteria.yearTo !== undefined && (record.examYear ?? Number.POSITIVE_INFINITY) > criteria.yearTo) return false;
  if (criteria.subjectId && record.subjectId !== criteria.subjectId) return false;
  if (criteria.topicPath && record.topicPath !== criteria.topicPath) return false;
  if (criteria.subtopicPath && record.subtopicPath !== criteria.subtopicPath) return false;
  if (criteria.difficulty && record.classification.difficulty !== criteria.difficulty) return false;
  if (criteria.verification && record.verification !== criteria.verification) return false;
  // No historical source records a question type. Never pretend one exists.
  if (criteria.questionType) return false;

  if (requireEligible) {
    if (!record.eligibleForPyq) return false;
    if (!(INDEPENDENTLY_VERIFIED_STATUSES as readonly string[]).includes(record.verification)) return false;
    if (!record.verifiedAnswer) return false;
  }
  return true;
}

export function createInMemoryHistoricalRepository(
  initial: readonly HistoricalQuestionRecord[] = [],
): HistoricalAnalyticsRepository {
  const rows = [...initial];

  function select(criteria: HistoricalAnalyticsFilter, requireEligible: boolean) {
    return rows.filter((record) => matches(record, criteria, requireEligible));
  }

  return {
    async findAll(criteria) {
      return select(criteria, false);
    },
    async findEligible(criteria) {
      const { excludeIds, limit } = criteria;
      const excluded = new Set(excludeIds ?? []);
      const matched = select(criteria, true).filter((record) => !excluded.has(record.id));
      return limit === undefined ? matched : matched.slice(0, Math.max(0, limit));
    },
    async count(criteria) {
      return select(criteria, true).length;
    },
    async getByIds(ids) {
      const wanted = new Set(ids);
      return rows.filter(
        (record) =>
          wanted.has(record.id) &&
          record.eligibleForPyq &&
          (INDEPENDENTLY_VERIFIED_STATUSES as readonly string[]).includes(record.verification) &&
          Boolean(record.verifiedAnswer),
      );
    },
    async findDuplicateGroup(fingerprint) {
      const found = rows.find((record) => recordFingerprint(record) === fingerprint);
      return found?.duplicateGroupId ?? found?.id ?? null;
    },
  };
}

type WhereInput = Prisma.HistoricalQuestionWhereInput;

function prismaWhere(
  criteria: HistoricalAnalyticsFilter,
  requireEligible: boolean,
): WhereInput {
  const scope = profileScope(criteria);
  // Preview batches stage rows in HistoricalQuestion for auditability, but
  // only rows belonging to IMPORTED batches are visible to any read path.
  const and: WhereInput[] = [{ importBatch: { status: "IMPORTED" } }];
  if (!scope.available) {
    and.push({ family: "__UNAVAILABLE_PROFILE__" });
  } else {
    if (scope.family) and.push({ family: scope.family });
    if (scope.organization) and.push({ organization: scope.organization });
    if (scope.recruitmentPost) and.push({ recruitmentPost: scope.recruitmentPost });
  }
  if (criteria.family) and.push({ family: criteria.family });
  if (criteria.organization) and.push({ organization: criteria.organization });
  if (criteria.recruitmentPost) and.push({ recruitmentPost: criteria.recruitmentPost });
  if (criteria.yearFrom !== undefined || criteria.yearTo !== undefined) {
    and.push({
      examYear: {
        ...(criteria.yearFrom === undefined ? {} : { gte: criteria.yearFrom }),
        ...(criteria.yearTo === undefined ? {} : { lte: criteria.yearTo }),
      },
    });
  }
  if (criteria.subjectId) and.push({ subjectId: criteria.subjectId });
  if (criteria.topicPath) and.push({ topicPath: criteria.topicPath });
  if (criteria.subtopicPath) and.push({ subtopicPath: criteria.subtopicPath });
  // Difficulty lives in a JSON column; it is filtered after row mapping so a
  // malformed JSON shape cannot turn into a false positive in the database.
  if (criteria.verification) and.push({ verification: criteria.verification });
  // A questionType filter can never match: the corpus has no such field.
  if (criteria.questionType) and.push({ id: "__NO_QUESTION_TYPE_DATA__" });

  if (requireEligible) {
    and.push({
      eligibleForPyq: true,
      verification: { in: [...INDEPENDENTLY_VERIFIED_STATUSES] },
      verifiedAnswer: { in: ["A", "B", "C", "D"] },
    });
  }

  return { AND: and };
}

function filterByDifficulty(
  records: HistoricalQuestionRecord[],
  criteria: HistoricalAnalyticsFilter,
): HistoricalQuestionRecord[] {
  if (!criteria.difficulty) return records;
  return records.filter((record) => record.classification.difficulty === criteria.difficulty);
}

export function createPrismaHistoricalRepository(
  client: PrismaClient,
): HistoricalAnalyticsRepository {
  return {
    async findAll(criteria) {
      const rows = await client.historicalQuestion.findMany({
        where: prismaWhere(criteria, false),
        orderBy: [{ examYear: "asc" }, { subjectId: "asc" }, { topicPath: "asc" }],
      });
      return filterByDifficulty(rows.map(historicalQuestionFromRow), criteria);
    },

    async findEligible(criteria) {
      const { excludeIds, limit } = criteria;
      const rows = await client.historicalQuestion.findMany({
        where: {
          ...prismaWhere(criteria, true),
          ...(excludeIds && excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
        },
        orderBy: [{ examYear: "asc" }, { subjectId: "asc" }, { topicPath: "asc" }],
        ...(limit === undefined ? {} : { take: Math.max(0, limit) }),
      });
      return filterByDifficulty(rows.map(historicalQuestionFromRow), criteria);
    },

    async count(criteria) {
      if (criteria.difficulty) {
        const rows = await client.historicalQuestion.findMany({
          where: prismaWhere(criteria, true),
        });
        return filterByDifficulty(rows.map(historicalQuestionFromRow), criteria).length;
      }
      return client.historicalQuestion.count({ where: prismaWhere(criteria, true) });
    },

    async getByIds(ids) {
      const rows = await client.historicalQuestion.findMany({
        where: {
          id: { in: ids },
          importBatch: { status: "IMPORTED" },
          eligibleForPyq: true,
          verification: { in: [...INDEPENDENTLY_VERIFIED_STATUSES] },
          verifiedAnswer: { in: ["A", "B", "C", "D"] },
        },
      });
      return rows.map(historicalQuestionFromRow);
    },

    async findDuplicateGroup(fingerprint) {
      const row = await client.historicalQuestion.findFirst({
        where: { contentHash: fingerprint, importBatch: { status: "IMPORTED" } },
      });
      return row?.duplicateGroupId ?? row?.id ?? null;
    },
  };
}

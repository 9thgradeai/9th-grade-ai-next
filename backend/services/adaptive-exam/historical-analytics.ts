// backend/services/adaptive-exam/historical-analytics.ts
// Module 5 of Adaptive Exam V2.0: descriptive historical analytics.
//
// Every number here is an observation over stored records. `recurrenceRate` is
// observed distinct-years / comparable-years, explicitly NOT a probability of
// future appearance. Unsourced dimensions are disclosed as gaps instead of
// being filled with plausible values.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamLogger,
  AdaptiveValidationResult,
  AuditEvent,
  DifficultyBand,
  ExamAuditService,
  HistoricalAnalyticsFilter,
  HistoricalAnalyticsReport,
  HistoricalAnalyticsService,
  IsoTimestamp,
  TopicFrequency,
} from "./contracts";
import { adaptiveError } from "./errors";
import { hashSnapshot } from "./hash";
import type { HistoricalAnalyticsRepository } from "./historical-repository";
import { INDEPENDENTLY_VERIFIED_STATUSES } from "./historical-repository";

export const DEFAULT_DECAY_PARAMETER = 0.08;

export type AnalyticsThresholds = Readonly<{
  minSampleSize: number;
  minComparableYears: number;
  minVerifiedShare: number;
  recentYearWindow: number;
}>;

export const DEFAULT_ANALYTICS_THRESHOLDS: AnalyticsThresholds = Object.freeze({
  minSampleSize: 30,
  minComparableYears: 2,
  minVerifiedShare: 0.8,
  recentYearWindow: 5,
});

export type StoredHistoricalAnalyticsSnapshot = Readonly<{
  id: string;
  profileId?: string;
  filter: HistoricalAnalyticsFilter;
  report: HistoricalAnalyticsReport;
  coverage: HistoricalAnalyticsReport["coverage"];
  contentHash: string;
  createdAt: IsoTimestamp;
}>;

export interface HistoricalAnalyticsSnapshotStore {
  findByHash(profileId: string | undefined, contentHash: string): Promise<StoredHistoricalAnalyticsSnapshot | null>;
  insert(snapshot: StoredHistoricalAnalyticsSnapshot): Promise<StoredHistoricalAnalyticsSnapshot>;
  clear(): Promise<void>;
}

const NOOP_LOGGER: AdaptiveExamLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => NOOP_LOGGER,
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asObject(value: Prisma.JsonValue, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Historical analytics snapshot has an invalid ${field} column.`);
  }
  return value as Record<string, unknown>;
}

export function createInMemoryAnalyticsSnapshotStore(): HistoricalAnalyticsSnapshotStore {
  const rows = new Map<string, StoredHistoricalAnalyticsSnapshot>();
  const key = (profileId: string | undefined, hash: string): string => `${profileId ?? "-"}::${hash}`;
  return {
    async findByHash(profileId, contentHash) {
      return rows.get(key(profileId, contentHash)) ?? null;
    },
    async insert(snapshot) {
      const k = key(snapshot.profileId, snapshot.contentHash);
      if (!rows.has(k)) rows.set(k, snapshot);
      return rows.get(k) as StoredHistoricalAnalyticsSnapshot;
    },
    async clear() {
      rows.clear();
    },
  };
}

export function createPrismaAnalyticsSnapshotStore(
  client: PrismaClient,
): HistoricalAnalyticsSnapshotStore {
  return {
    async findByHash(profileId, contentHash) {
      const row = await client.historicalAnalyticsSnapshot.findFirst({
        where: { profileId: profileId ?? null, contentHash },
        orderBy: { createdAt: "desc" },
      });
      return row
        ? {
            id: row.id,
            ...(row.profileId ? { profileId: row.profileId } : {}),
            filter: asObject(row.filter, "filter") as unknown as HistoricalAnalyticsFilter,
            report: asObject(row.report, "report") as unknown as HistoricalAnalyticsReport,
            coverage: asObject(row.coverage, "coverage") as unknown as HistoricalAnalyticsReport["coverage"],
            contentHash: row.contentHash,
            createdAt: row.createdAt.toISOString(),
          }
        : null;
    },

    async insert(snapshot) {
      const row = await client.historicalAnalyticsSnapshot.create({
        data: {
          ...(snapshot.id ? { id: snapshot.id } : {}),
          ...(snapshot.profileId ? { profileId: snapshot.profileId } : {}),
          filter: asJson(snapshot.filter),
          report: asJson(snapshot.report),
          coverage: asJson(snapshot.coverage),
          contentHash: snapshot.contentHash,
          ...(snapshot.createdAt ? { createdAt: new Date(snapshot.createdAt) } : {}),
        },
      });
      return {
        id: row.id,
        ...(row.profileId ? { profileId: row.profileId } : {}),
        filter: snapshot.filter,
        report: snapshot.report,
        coverage: snapshot.coverage,
        contentHash: row.contentHash,
        createdAt: row.createdAt.toISOString(),
      };
    },

    async clear() {
      await client.historicalAnalyticsSnapshot.deleteMany({});
    },
  };
}

export type CreateHistoricalAnalyticsServiceOptions = Readonly<{
  repository: HistoricalAnalyticsRepository;
  clock: { now(): IsoTimestamp };
  requestId: string;
  logger?: AdaptiveExamLogger;
  audit?: ExamAuditService;
  snapshotStore?: HistoricalAnalyticsSnapshotStore;
  decayParameter?: number;
  thresholds?: Partial<AnalyticsThresholds>;
  newId?(): string;
}>;

function countByYear(
  records: readonly { examYear?: number }[],
): Array<{ year: number; count: number }> {
  const counts = new Map<number, number>();
  for (const record of records) {
    if (typeof record.examYear !== "number") continue;
    counts.set(record.examYear, (counts.get(record.examYear) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);
}

function countBySubject(
  records: readonly { subjectId: string }[],
): Array<{ subjectId: string; count: number }> {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.subjectId, (counts.get(record.subjectId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([subjectId, count]) => ({ subjectId, count }))
    .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId));
}

function buildTopics(
  records: ReadonlyArray<{
    topicPath: string;
    examYear?: number;
    normalizedText: string;
  }>,
  comparableYears: number,
  decayParameter: number,
  recentYearWindow: number,
): TopicFrequency[] {
  const years = records
    .map((record) => record.examYear)
    .filter((year): year is number => typeof year === "number");
  const maxYear = years.length > 0 ? Math.max(...years) : 0;
  const buckets = new Map<string, TopicFrequency>();
  const topicYears = new Map<string, Set<number>>();

  for (const record of records) {
    let topic = buckets.get(record.topicPath);
    if (!topic) {
      topic = {
        topicPath: record.topicPath,
        count: 0,
        distinctYears: 0,
        recurrenceRate: 0,
        recentFrequency: 0,
        olderFrequency: 0,
        weightedFrequency: 0,
      };
      buckets.set(record.topicPath, topic);
      topicYears.set(record.topicPath, new Set());
    }
    topic.count += 1;
    if (typeof record.examYear === "number") {
      topicYears.get(record.topicPath)?.add(record.examYear);
      if (record.examYear > maxYear - recentYearWindow) topic.recentFrequency += 1;
      else topic.olderFrequency += 1;
      topic.weightedFrequency += Math.exp(-decayParameter * (maxYear - record.examYear));
    } else {
      topic.olderFrequency += 1;
    }
  }

  for (const [topicPath, topic] of buckets) {
    topic.distinctYears = topicYears.get(topicPath)?.size ?? 0;
    topic.recurrenceRate =
      comparableYears > 0 ? (topic.distinctYears / comparableYears) * 100 : 0;
    topic.weightedFrequency = Number(topic.weightedFrequency.toFixed(6));
    topic.recurrenceRate = Number(topic.recurrenceRate.toFixed(6));
  }

  return [...buckets.values()].sort(
    (a, b) => b.count - a.count || a.topicPath.localeCompare(b.topicPath),
  );
}

export function createHistoricalAnalyticsService(
  options: CreateHistoricalAnalyticsServiceOptions,
): HistoricalAnalyticsService {
  const {
    repository,
    clock,
    requestId,
    logger = NOOP_LOGGER,
    snapshotStore,
    decayParameter = DEFAULT_DECAY_PARAMETER,
    newId = () => `analytics:${Date.now()}:${Math.random().toString(16).slice(2)}`,
  } = options;
  const thresholds = { ...DEFAULT_ANALYTICS_THRESHOLDS, ...options.thresholds };

  function fail(
    code: Parameters<typeof adaptiveError>[0],
    message: string,
    metadata: Record<string, unknown> = {},
  ): never {
    throw adaptiveError(code, message, { stage: "reporting", requestId, metadata });
  }

  return {
    async analyze(filter) {
      let records;
      try {
        records = await repository.findAll(filter);
      } catch (error) {
        fail("ADAPTIVE_PERSISTENCE_ERROR", "Could not read historical records for analytics.", {
          cause: error instanceof Error ? error.message : "unknown",
        });
      }

      const sampleSize = records.length;
      const yearWise = countByYear(records);
      const comparableYears = yearWise.length;
      const verifiedCount = records.filter((record) =>
        (INDEPENDENTLY_VERIFIED_STATUSES as readonly string[]).includes(record.verification),
      ).length;
      const verifiedShare = sampleSize > 0 ? verifiedCount / sampleSize : 0;
      const gaps: string[] = [];

      if (sampleSize < thresholds.minSampleSize) {
        gaps.push(
          `Sample size ${sampleSize} is below the governance threshold ${thresholds.minSampleSize}.`,
        );
      }
      if (comparableYears < thresholds.minComparableYears) {
        gaps.push(
          `Only ${comparableYears} distinct exam year(s) are represented; recurrence is not comparable across years.`,
        );
      }
      if (verifiedShare < thresholds.minVerifiedShare) {
        gaps.push(
          `Verified answer share ${(verifiedShare * 100).toFixed(1)}% is below the governance threshold ${(thresholds.minVerifiedShare * 100).toFixed(0)}%.`,
        );
      }
      if (records.every((record) => record.classification.difficulty === undefined)) {
        gaps.push("No sourced difficulty labels exist in the historical corpus; difficulty counts are all zero.");
      }
      if (filter.questionType) {
        gaps.push("questionType filters cannot be evaluated: the historical record has no questionType field.");
      }
      gaps.push(
        "Near-duplicate classification is not represented in the historical record; exact duplicates are detected from normalised text only.",
      );
      gaps.push(
        "Malformed rows are excluded during ingestion and counted in ImportReport.failed; they are not part of this analytics sample.",
      );

      const insufficientEvidence =
        sampleSize < thresholds.minSampleSize ||
        comparableYears < thresholds.minComparableYears ||
        verifiedShare < thresholds.minVerifiedShare;

      const difficultyProfile: Record<DifficultyBand, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
      for (const record of records) {
        const band = record.classification.difficulty;
        if (band === "EASY" || band === "MEDIUM" || band === "HARD") difficultyProfile[band] += 1;
      }

      const normalizedCounts = new Map<string, number>();
      for (const record of records) {
        normalizedCounts.set(
          record.normalizedText,
          (normalizedCounts.get(record.normalizedText) ?? 0) + 1,
        );
      }
      let exactDuplicates = 0;
      for (const count of normalizedCounts.values()) {
        if (count > 1) exactDuplicates += count - 1;
      }

      const report: HistoricalAnalyticsReport = {
        filter,
        generatedAt: clock.now(),
        decayParameter,
        coverage: {
          sampleSize,
          yearsCovered: comparableYears,
          comparableYears,
          verifiedShare: Number(verifiedShare.toFixed(6)),
          insufficientEvidence,
          gaps,
        },
        yearWise,
        subjectWise: countBySubject(records),
        topics: buildTopics(
          records.map((record) => ({
            topicPath: record.topicPath,
            ...(record.examYear === undefined ? {} : { examYear: record.examYear }),
            normalizedText: record.normalizedText,
          })),
          comparableYears,
          decayParameter,
          thresholds.recentYearWindow,
        ),
        questionTypeDistribution: {},
        difficultyProfile,
        duplicates: { exact: exactDuplicates, near: 0 },
        quality: {
          verified: verifiedCount,
          disputed: records.filter((record) => record.verification === "DISPUTED").length,
          malformed: 0,
        },
      };

      const contentHash = hashSnapshot({
        filter,
        decayParameter,
        yearWise,
        subjectWise: report.subjectWise,
        topics: report.topics,
        duplicates: report.duplicates,
        quality: report.quality,
        coverage: report.coverage,
      });

      if (snapshotStore) {
        const cached = await snapshotStore.findByHash(filter.profileId, contentHash);
        if (cached) return cached.report;
        await snapshotStore.insert({
          id: newId(),
          ...(filter.profileId ? { profileId: filter.profileId } : {}),
          filter,
          report,
          coverage: report.coverage,
          contentHash,
          createdAt: report.generatedAt,
        });
      }

      if (options.audit) {
        try {
          const event: AuditEvent = {
            name: "ANALYTICS_COMPUTED",
            occurredAt: report.generatedAt,
            requestId,
            entityType: "HistoricalAnalytics",
            entityId: contentHash,
            metadata: {
              sampleSize,
              verifiedShare: report.coverage.verifiedShare,
              profileId: filter.profileId ?? null,
              gapCount: gaps.length,
            },
          };
          await options.audit.record(event);
        } catch (error) {
          logger.error("adaptive.historical.analytics-audit-failed", {
            contentHash,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      }

      return report;
    },

    async invalidate(reason) {
      if (snapshotStore) await snapshotStore.clear();
      logger.info("adaptive.historical.analytics-invalidated", { reason });
    },
  };
}

/** Exported so tests and callers can see the governance thresholds in effect. */
export function analyticsValidationResult(
  report: HistoricalAnalyticsReport,
): AdaptiveValidationResult {
  const issues: AdaptiveValidationResult["issues"] = [];
  if (report.coverage.insufficientEvidence) {
    issues.push({
      severity: "warning",
      code: "HISTORICAL_INSUFFICIENT_EVIDENCE",
      message: "Historical analytics has insufficient evidence for adaptive weighting.",
      path: "coverage.insufficientEvidence",
    });
  }
  for (const gap of report.coverage.gaps) {
    issues.push({ severity: "warning", code: "HISTORICAL_GAP", message: gap, path: "coverage.gaps" });
  }
  return { valid: true, issues };
}

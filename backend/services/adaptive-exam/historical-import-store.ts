// backend/services/adaptive-exam/historical-import-store.ts
// Persistence ports and adapters for Phase 05 historical ingestion.
//
// The domain modules know only these ports. The Prisma adapter is the sole
// place that maps adaptive contracts onto the ADR-075 historical tables.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  EntityId,
  HistoricalQuestionRecord,
  ImportIssue,
  ImportReport,
  IsoTimestamp,
  OptionKey,
} from "./contracts";

export type HistoricalBatchStatus =
  | "PREVIEW"
  | "APPROVED"
  | "IMPORTED"
  | "ROLLED_BACK"
  | "REJECTED";

export type StoredHistoricalBatch = Readonly<{
  id: EntityId;
  sourceId: string;
  sourceRef: string;
  fileHash?: string;
  family: HistoricalQuestionRecord["family"];
  status: HistoricalBatchStatus;
  actorId?: string;
  totals: ImportReport["totals"];
  report: ImportReport;
  startedAt?: IsoTimestamp;
  finishedAt?: IsoTimestamp;
  createdAt: IsoTimestamp;
}>;

export type StoredHistoricalQuestion = Readonly<{
  record: HistoricalQuestionRecord;
  fingerprint: string;
  contentHash: string;
}>;

export type CreateBatchInput = Omit<
  StoredHistoricalBatch,
  "status" | "createdAt" | "finishedAt"
> & {
  status?: HistoricalBatchStatus;
  createdAt?: IsoTimestamp;
  finishedAt?: IsoTimestamp;
};

export interface HistoricalImportStore {
  createBatch(input: CreateBatchInput): Promise<StoredHistoricalBatch>;
  findBatch(batchId: EntityId): Promise<StoredHistoricalBatch | null>;
  updateBatch(
    batchId: EntityId,
    patch: Partial<Pick<
      StoredHistoricalBatch,
      "status" | "actorId" | "totals" | "report" | "finishedAt" | "fileHash"
    >>,
  ): Promise<StoredHistoricalBatch>;
  replaceIssues(batchId: EntityId, issues: readonly ImportIssue[]): Promise<void>;
  listIssues(batchId: EntityId): Promise<ImportIssue[]>;
  insertRecords(
    batchId: EntityId,
    records: readonly StoredHistoricalQuestion[],
  ): Promise<void>;
  listRecords(batchId: EntityId): Promise<StoredHistoricalQuestion[]>;
  deleteRecords(batchId: EntityId): Promise<number>;
  findDuplicateGroup(fingerprint: string): Promise<EntityId | null>;
}

// ─────────────────────────────────────────────────────────────
// In-memory adapter (tests / development only)
// ─────────────────────────────────────────────────────────────

export function createInMemoryHistoricalImportStore(): HistoricalImportStore {
  const batches = new Map<EntityId, StoredHistoricalBatch>();
  const issues = new Map<EntityId, ImportIssue[]>();
  const records = new Map<EntityId, StoredHistoricalQuestion[]>();

  function requireBatch(batchId: EntityId): StoredHistoricalBatch {
    const batch = batches.get(batchId);
    if (!batch) throw new Error(`Unknown historical import batch ${batchId}`);
    return batch;
  }

  return {
    async createBatch(input) {
      const batch: StoredHistoricalBatch = {
        ...input,
        status: input.status ?? "PREVIEW",
        createdAt: input.createdAt ?? input.report.startedAt,
      };
      batches.set(batch.id, batch);
      issues.set(batch.id, []);
      records.set(batch.id, []);
      return batch;
    },

    async findBatch(batchId) {
      return batches.get(batchId) ?? null;
    },

    async updateBatch(batchId, patch) {
      const existing = requireBatch(batchId);
      const updated: StoredHistoricalBatch = { ...existing, ...patch };
      batches.set(batchId, updated);
      return updated;
    },

    async replaceIssues(batchId, nextIssues) {
      requireBatch(batchId);
      issues.set(batchId, [...nextIssues]);
    },

    async listIssues(batchId) {
      return [...(issues.get(batchId) ?? [])];
    },

    async insertRecords(batchId, nextRecords) {
      requireBatch(batchId);
      records.set(batchId, [...(records.get(batchId) ?? []), ...nextRecords]);
    },

    async listRecords(batchId) {
      return [...(records.get(batchId) ?? [])];
    },

    async deleteRecords(batchId) {
      const removed = records.get(batchId)?.length ?? 0;
      records.set(batchId, []);
      return removed;
    },

    async findDuplicateGroup(fingerprint) {
      for (const rows of records.values()) {
        for (const row of rows) {
          if (row.fingerprint === fingerprint) {
            return row.record.duplicateGroupId ?? row.record.id;
          }
        }
      }
      return null;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Prisma adapter
// ─────────────────────────────────────────────────────────────

type BatchRow = Prisma.HistoricalImportBatchGetPayload<Record<string, never>>;
type QuestionRow = Prisma.HistoricalQuestionGetPayload<Record<string, never>>;

function asObject(value: Prisma.JsonValue, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Historical import has an invalid ${field} column.`);
  }
  return value as Record<string, unknown>;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function optionKey(value: string | null): OptionKey | undefined {
  return value === "A" || value === "B" || value === "C" || value === "D"
    ? value
    : undefined;
}

function fromBatchRow(row: BatchRow): StoredHistoricalBatch {
  return {
    id: row.id,
    sourceId: row.sourceRef,
    sourceRef: row.sourceRef,
    ...(row.fileHash ? { fileHash: row.fileHash } : {}),
    family: row.family as HistoricalQuestionRecord["family"],
    status: row.status as HistoricalBatchStatus,
    ...(row.actorId ? { actorId: row.actorId } : {}),
    totals: asObject(row.totals, "totals") as unknown as ImportReport["totals"],
    report: asObject(row.report, "report") as unknown as ImportReport,
    ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
    ...(row.finishedAt ? { finishedAt: row.finishedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

export function historicalQuestionFromRow(row: QuestionRow): HistoricalQuestionRecord {
  const options = asObject(row.options, "options");
  const provenance = asObject(row.provenance, "provenance");
  const classification = asObject(row.classification, "classification");
  const record: HistoricalQuestionRecord = {
    id: row.id,
    family: row.family as HistoricalQuestionRecord["family"],
    organization: row.organization,
    recruitmentPost: row.recruitmentPost,
    examinationName: row.examinationName,
    ...(row.examYear === null ? {} : { examYear: row.examYear }),
    ...(row.examDate ? { examDate: row.examDate.toISOString() } : {}),
    stage: row.stage,
    ...(row.paperSet ? { paperSet: row.paperSet } : {}),
    subjectId: row.subjectId,
    subjectName: row.subjectName,
    topicPath: row.topicPath,
    ...(row.subtopicPath ? { subtopicPath: row.subtopicPath } : {}),
    originalLanguage: row.originalLanguage as HistoricalQuestionRecord["originalLanguage"],
    questionText: row.questionText,
    options: {
      A: String(options.A ?? ""),
      B: String(options.B ?? ""),
      C: String(options.C ?? ""),
      D: String(options.D ?? ""),
    },
    ...(optionKey(row.claimedAnswer) ? { claimedAnswer: optionKey(row.claimedAnswer) } : {}),
    ...(optionKey(row.verifiedAnswer) ? { verifiedAnswer: optionKey(row.verifiedAnswer) } : {}),
    ...(row.explanation ? { explanation: row.explanation } : {}),
    verification: row.verification as HistoricalQuestionRecord["verification"],
    explanationOrigin: row.explanationOrigin as HistoricalQuestionRecord["explanationOrigin"],
    provenance: {
      sourceType: provenance.sourceType as HistoricalQuestionRecord["provenance"]["sourceType"],
      ...(typeof provenance.sourceFile === "string" ? { sourceFile: provenance.sourceFile } : {}),
      ...(typeof provenance.reference === "string" ? { reference: provenance.reference } : {}),
      ...(typeof provenance.sourceClaim === "string" ? { sourceClaim: provenance.sourceClaim } : {}),
      ...(typeof provenance.sourceUrl === "string" ? { sourceUrl: provenance.sourceUrl } : {}),
      ...(row.importBatchId ? { importBatchId: row.importBatchId } : {}),
    },
    classification: {
      status: classification.status as HistoricalQuestionRecord["classification"]["status"],
      ...(typeof classification.difficulty === "string"
        ? { difficulty: classification.difficulty as HistoricalQuestionRecord["classification"]["difficulty"] }
        : {}),
    },
    ...(row.duplicateGroupId ? { duplicateGroupId: row.duplicateGroupId } : {}),
    originalSourceText: row.originalSourceText,
    normalizedText: row.normalizedText,
    eligibleForPyq: row.eligibleForPyq,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  return record;
}

export function createPrismaHistoricalImportStore(
  client: PrismaClient,
): HistoricalImportStore {
  return {
    async createBatch(input) {
      const row = await client.historicalImportBatch.create({
        data: {
          id: input.id,
          sourceRef: input.sourceRef,
          ...(input.fileHash ? { fileHash: input.fileHash } : {}),
          family: input.family,
          status: input.status ?? "PREVIEW",
          ...(input.actorId ? { actorId: input.actorId } : {}),
          totals: asJson(input.totals),
          report: asJson(input.report),
          ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
          ...(input.finishedAt ? { finishedAt: new Date(input.finishedAt) } : {}),
          ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
        },
      });
      return fromBatchRow(row);
    },

    async findBatch(batchId) {
      const row = await client.historicalImportBatch.findUnique({ where: { id: batchId } });
      return row ? fromBatchRow(row) : null;
    },

    async updateBatch(batchId, patch) {
      const row = await client.historicalImportBatch.update({
        where: { id: batchId },
        data: {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.actorId ? { actorId: patch.actorId } : {}),
          ...(patch.totals ? { totals: asJson(patch.totals) } : {}),
          ...(patch.report ? { report: asJson(patch.report) } : {}),
          ...(patch.finishedAt ? { finishedAt: new Date(patch.finishedAt) } : {}),
          ...(patch.fileHash ? { fileHash: patch.fileHash } : {}),
        },
      });
      return fromBatchRow(row);
    },

    async replaceIssues(batchId, nextIssues) {
      await client.$transaction([
        client.historicalImportIssue.deleteMany({ where: { batchId } }),
        ...(nextIssues.length > 0
          ? [
              client.historicalImportIssue.createMany({
                data: nextIssues.map((issue) => ({
                  batchId,
                  recordRef: issue.recordRef,
                  stage: issue.stage,
                  severity: issue.severity,
                  reason: issue.reason,
                  preservedRef: issue.preservedRef,
                })),
              }),
            ]
          : []),
      ]);
    },

    async listIssues(batchId) {
      const rows = await client.historicalImportIssue.findMany({
        where: { batchId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        recordRef: row.recordRef,
        stage: row.stage as ImportIssue["stage"],
        severity: row.severity as ImportIssue["severity"],
        reason: row.reason,
        preservedRef: row.preservedRef,
      }));
    },

    async insertRecords(batchId, nextRecords) {
      if (nextRecords.length === 0) return;
      await client.historicalQuestion.createMany({
        data: nextRecords.map(({ record, fingerprint, contentHash }) => ({
          family: record.family,
          organization: record.organization,
          recruitmentPost: record.recruitmentPost,
          examinationName: record.examinationName,
          ...(record.examYear === undefined ? {} : { examYear: record.examYear }),
          ...(record.examDate ? { examDate: new Date(record.examDate) } : {}),
          stage: record.stage,
          ...(record.paperSet ? { paperSet: record.paperSet } : {}),
          subjectId: record.subjectId,
          subjectName: record.subjectName,
          topicPath: record.topicPath,
          ...(record.subtopicPath ? { subtopicPath: record.subtopicPath } : {}),
          originalLanguage: record.originalLanguage,
          questionText: record.questionText,
          options: asJson(record.options),
          ...(record.claimedAnswer ? { claimedAnswer: record.claimedAnswer } : {}),
          ...(record.verifiedAnswer ? { verifiedAnswer: record.verifiedAnswer } : {}),
          ...(record.explanation ? { explanation: record.explanation } : {}),
          verification: record.verification,
          explanationOrigin: record.explanationOrigin,
          provenance: asJson({
            ...record.provenance,
            importBatchId: batchId,
            fingerprint,
          }),
          classification: asJson(record.classification),
          ...(record.duplicateGroupId ? { duplicateGroupId: record.duplicateGroupId } : {}),
          originalSourceText: record.originalSourceText,
          normalizedText: record.normalizedText,
          eligibleForPyq: record.eligibleForPyq,
          importBatchId: batchId,
          contentHash,
        })),
      });
    },

    async listRecords(batchId) {
      const rows = await client.historicalQuestion.findMany({
        where: { importBatchId: batchId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map((row) => ({
        record: historicalQuestionFromRow(row),
        fingerprint:
          typeof asObject(row.provenance, "provenance").fingerprint === "string"
            ? String(asObject(row.provenance, "provenance").fingerprint)
            : row.contentHash,
        contentHash: row.contentHash,
      }));
    },

    async deleteRecords(batchId) {
      const result = await client.historicalQuestion.deleteMany({ where: { importBatchId: batchId } });
      return result.count;
    },

    async findDuplicateGroup(fingerprint) {
      const row = await client.historicalQuestion.findFirst({ where: { contentHash: fingerprint } });
      return row?.duplicateGroupId ?? row?.id ?? null;
    },
  };
}

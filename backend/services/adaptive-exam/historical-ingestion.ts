// backend/services/adaptive-exam/historical-ingestion.ts
// Module 4 of Adaptive Exam V2.0: source discovery → preview → approval → import.
//
// SAFETY INVARIANTS
//   • Parsed answers are source claims. This module can only produce
//     SOURCE_CLAIMED, DISPUTED or UNVERIFIED records; it can never upgrade a
//     record to CROSS_CHECKED/HUMAN_VERIFIED or set eligibleForPyq=true.
//   • Preview rows are staged under a PREVIEW batch and are invisible to every
//     repository read path until the batch is approved and imported.
//   • Discovery-only sources (BCS Uttoron in this phase) can be listed but not
//     imported.
//   • Every report is re-derived from file contents; metadata totals are never
//     trusted.

import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AdaptiveExecutionContext,
  AdaptiveExamLogger,
  AnswerVerificationStatus,
  AuditEvent,
  EntityId,
  ExamAuditService,
  HistoricalDataIngestionService,
  HistoricalQuestionRecord,
  ImportIssue,
  ImportReport,
  IsoTimestamp,
} from "./contracts";
import { adaptiveError } from "./errors";
import {
  dedupeParsedRecords,
  parseHistoricalSource,
  type ParsedHistoricalRecord,
} from "./historical-content";
import {
  getHistoricalSource,
  listHistoricalSources,
  type HistoricalSourceDescriptor,
} from "./historical-sources";
import type {
  HistoricalImportStore,
  StoredHistoricalBatch,
  StoredHistoricalQuestion,
} from "./historical-import-store";
import type { HistoricalSourceReader } from "./historical-source-reader";

const NOOP_LOGGER: AdaptiveExamLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  child: () => NOOP_LOGGER,
};

const ROLLBACK_PROCEDURE =
  "Call rollback(batchId) with an authenticated actor; imported rows for the batch are deleted and the batch is marked ROLLED_BACK.";

export type HistoricalIngestionService = HistoricalDataIngestionService & {
  /** Creates a PREVIEW batch from a catalogue source. No rows are imported. */
  createPreviewBatch(sourceId: EntityId, ctx: AdaptiveExecutionContext): Promise<EntityId>;
  /** Primary parse entry point: the source descriptor selects the parser. */
  parseSource(sourceId: EntityId, text: string): Promise<HistoricalQuestionRecord[]>;
  getBatch(batchId: EntityId): Promise<StoredHistoricalBatch | null>;
};

export type CreateHistoricalIngestionServiceOptions = Readonly<{
  store: HistoricalImportStore;
  reader: HistoricalSourceReader;
  clock: { now(): IsoTimestamp };
  requestId: string;
  logger?: AdaptiveExamLogger;
  audit?: ExamAuditService;
  /** Used only by the legacy `parse(text)` contract method. */
  defaultSourceId?: EntityId;
  newId?(): EntityId;
}>;

function isIndependentlyVerified(status: AnswerVerificationStatus): boolean {
  return status === "CROSS_CHECKED" || status === "HUMAN_VERIFIED";
}

function requireSource(sourceId: EntityId): HistoricalSourceDescriptor {
  const source = getHistoricalSource(sourceId);
  if (!source) {
    throw adaptiveError("ADAPTIVE_HISTORICAL_SCOPE_INVALID", "Unknown historical source id.", {
      stage: "historical",
      requestId: "historical-ingestion",
      metadata: { sourceId },
    });
  }
  return source;
}

function countBySeverity(issues: readonly ImportIssue[], severity: ImportIssue["severity"]): number {
  return issues.filter((issue) => issue.severity === severity).length;
}

export function createHistoricalIngestionService(
  options: CreateHistoricalIngestionServiceOptions,
): HistoricalIngestionService {
  const { store, reader, clock, requestId } = options;
  const logger = options.logger ?? NOOP_LOGGER;
  const newId = options.newId ?? (() => randomUUID());

  function fail(
    code: Parameters<typeof adaptiveError>[0],
    message: string,
    metadata: Record<string, unknown> = {},
  ): never {
    throw adaptiveError(code, message, {
      stage: "historical",
      requestId,
      metadata,
    });
  }

  async function requireBatch(batchId: EntityId): Promise<StoredHistoricalBatch> {
    const batch = await store.findBatch(batchId);
    if (!batch) {
      fail("ADAPTIVE_IMPORT_INVALID", "Historical import batch does not exist.", { batchId });
    }
    return batch;
  }

  async function recordAudit(
    event: Omit<AuditEvent, "occurredAt" | "requestId">,
    ctx?: AdaptiveExecutionContext,
  ): Promise<void> {
    if (!options.audit) return;
    try {
      await options.audit.record({
        ...event,
        occurredAt: clock.now(),
        requestId: ctx?.requestId ?? requestId,
        ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      });
    } catch (error) {
      logger.error("adaptive.historical.audit-failed", { name: event.name, entityId: event.entityId });
      fail("ADAPTIVE_AUDIT_ERROR", "Could not record the historical import audit event.", {
        name: event.name,
        entityId: event.entityId,
        cause: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  function buildReport(input: {
    batchId: EntityId;
    source: HistoricalSourceDescriptor;
    startedAt: IsoTimestamp;
    records: readonly ParsedHistoricalRecord[];
    issues: readonly ImportIssue[];
    duplicateCount: number;
    imported?: number;
  }): ImportReport {
    const unverified = input.records.filter(
      (item) => !isIndependentlyVerified(item.record.verification),
    ).length;
    const parseFailures = countBySeverity(input.issues, "error");
    const safetyIssue: ImportIssue = {
      recordRef: input.source.id,
      stage: "VERIFICATION",
      reason:
        "All answers remain source-claimed/disputed/unverified. No record is PYQ-eligible until an independent verification pass supplies a verified answer.",
      severity: "warning",
      preservedRef: input.source.filePath,
    };
    return {
      batchId: input.batchId,
      startedAt: input.startedAt,
      finishedAt: clock.now(),
      totals: {
        extracted: input.records.length + parseFailures,
        parsed: input.records.length,
        imported: input.imported ?? 0,
        skipped: parseFailures,
        duplicate: input.duplicateCount,
        unverified,
        failed: parseFailures,
      },
      exceptions: [...input.issues, safetyIssue],
      rollback: { procedure: ROLLBACK_PROCEDURE },
    };
  }

  async function parseSourceImpl(
    sourceId: EntityId,
    text: string,
  ): Promise<HistoricalQuestionRecord[]> {
    const source = requireSource(sourceId);
    return parseHistoricalSource(text, source, clock.now()).records.map((item) => item.record);
  }

  return {
    async discover(sourceRef) {
      const source = getHistoricalSource(sourceRef);
      return source ? [source.id] : [];
    },

    async extract(sourceId) {
      const source = requireSource(sourceId);
      return (await reader.read(source)).text;
    },

    async normalize(raw) {
      return raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").normalize("NFC");
    },

    async parse(text) {
      if (!options.defaultSourceId) {
        fail(
          "ADAPTIVE_IMPORT_INVALID",
          "A source id is required to parse historical text; use parseSource().",
        );
      }
      return parseSourceImpl(options.defaultSourceId, text);
    },

    parseSource: parseSourceImpl,

    async classify(record) {
      // No sourced difficulty distribution exists in this corpus. Preserve the
      // record rather than assigning a plausible-looking default band.
      return { ...record, classification: { ...record.classification, status: record.classification.status === "exception" ? "exception" : "unclassified" } };
    },

    async extractAnswer(record) {
      return record.claimedAnswer ?? null;
    },

    async verify(record) {
      if (record.verification === "DISPUTED") return "DISPUTED";
      if (record.claimedAnswer) return "SOURCE_CLAIMED";
      return "UNVERIFIED";
    },

    async dedupe(records) {
      const parsed: ParsedHistoricalRecord[] = records.map((record) => {
        const fingerprint = record.normalizedText;
        return { record, fingerprint, contentHash: fingerprint };
      });
      return dedupeParsedRecords(parsed).records.map((item) => item.record);
    },

    async createPreviewBatch(sourceId, ctx) {
      const source = requireSource(sourceId);
      if (source.reviewScope !== "PENDING_VERIFICATION") {
        fail("ADAPTIVE_HISTORICAL_SCOPE_INVALID", "This source is discovery-only in Phase 05.", {
          sourceId,
          reviewScope: source.reviewScope,
        });
      }
      if (!ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "An authenticated actor is required to preview historical data.");
      }

      const startedAt = clock.now();
      const content = await reader.read(source);
      const outcome = parseHistoricalSource(content.text, source, startedAt);
      const deduped = dedupeParsedRecords(outcome.records);
      const batchId = newId();
      const report = buildReport({
        batchId,
        source,
        startedAt,
        records: deduped.records,
        issues: outcome.issues,
        duplicateCount: deduped.duplicateCount,
      });

      await store.createBatch({
        id: batchId,
        sourceId,
        sourceRef: source.filePath,
        fileHash: content.sha256,
        family: source.family,
        actorId: ctx.userId,
        totals: report.totals,
        report,
        startedAt,
        finishedAt: report.finishedAt,
      });
      await store.replaceIssues(batchId, report.exceptions);
      await store.insertRecords(
        batchId,
        deduped.records.map(
          (item): StoredHistoricalQuestion => ({
            record: item.record,
            fingerprint: item.fingerprint,
            contentHash: item.contentHash,
          }),
        ),
      );

      logger.info("adaptive.historical.previewed", {
        batchId,
        sourceId,
        sha256: content.sha256,
        parsed: report.totals.parsed,
        duplicate: report.totals.duplicate,
      });
      return batchId;
    },

    async getBatch(batchId) {
      return store.findBatch(batchId);
    },

    async preview(batchId) {
      return (await requireBatch(batchId)).report;
    },

    async approve(batchId, ctx) {
      const batch = await requireBatch(batchId);
      if (!ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "An authenticated actor is required to approve an import.");
      }
      if (batch.status !== "PREVIEW") {
        fail("ADAPTIVE_IMPORT_CONFLICT", "Only a PREVIEW batch can be approved.", {
          batchId,
          status: batch.status,
        });
      }
      await store.updateBatch(batchId, { status: "APPROVED", actorId: ctx.userId, finishedAt: clock.now() });
      await recordAudit(
        {
          name: "HISTORICAL_IMPORT_APPROVED",
          actorId: ctx.userId,
          correlationId: ctx.correlationId,
          entityType: "HistoricalImportBatch",
          entityId: batchId,
          metadata: { sourceId: batch.sourceId, parsed: batch.totals.parsed },
        },
        ctx,
      );
    },

    async importBatch(batchId, ctx) {
      const batch = await requireBatch(batchId);
      if (batch.status === "IMPORTED") return batch.report;
      if (batch.status !== "APPROVED") {
        fail("ADAPTIVE_IMPORT_CONFLICT", "Only an APPROVED batch can be imported.", {
          batchId,
          status: batch.status,
        });
      }
      if (!ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "An authenticated actor is required to import a batch.");
      }

      const rows = await store.listRecords(batchId);
      if (rows.length === 0) {
        fail("ADAPTIVE_IMPORT_INVALID", "Approved batch has no records to import.", { batchId });
      }
      const report: ImportReport = {
        ...batch.report,
        finishedAt: clock.now(),
        totals: { ...batch.totals, imported: rows.length },
      };
      await store.updateBatch(batchId, {
        status: "IMPORTED",
        actorId: ctx.userId,
        totals: report.totals,
        report,
        finishedAt: report.finishedAt,
      });
      await recordAudit(
        {
          name: "HISTORICAL_IMPORT_APPROVED",
          actorId: ctx.userId,
          correlationId: ctx.correlationId,
          entityType: "HistoricalImportBatch",
          entityId: batchId,
          metadata: { action: "DATABASE_IMPORT", imported: rows.length, sourceId: batch.sourceId },
        },
        ctx,
      );
      return report;
    },

    async rollback(batchId, ctx) {
      const batch = await requireBatch(batchId);
      if (batch.status === "ROLLED_BACK") return batch.report;
      if (batch.status !== "IMPORTED" && batch.status !== "APPROVED") {
        fail("ADAPTIVE_IMPORT_CONFLICT", "This batch state cannot be rolled back.", {
          batchId,
          status: batch.status,
        });
      }
      if (!ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "An authenticated actor is required to roll back a batch.");
      }

      const removed = await store.deleteRecords(batchId);
      const report: ImportReport = {
        ...batch.report,
        finishedAt: clock.now(),
        totals: { ...batch.totals, imported: 0 },
      };
      await store.updateBatch(batchId, {
        status: "ROLLED_BACK",
        actorId: ctx.userId,
        totals: report.totals,
        report,
        finishedAt: report.finishedAt,
      });
      await recordAudit(
        {
          name: "HISTORICAL_IMPORT_ROLLED_BACK",
          actorId: ctx.userId,
          correlationId: ctx.correlationId,
          entityType: "HistoricalImportBatch",
          entityId: batchId,
          metadata: { removed, sourceId: batch.sourceId },
        },
        ctx,
      );
      return report;
    },
  };
}

/** Exported for tests that need a catalogue snapshot without file access. */
export function listDiscoverableHistoricalSources(): HistoricalSourceDescriptor[] {
  return listHistoricalSources();
}

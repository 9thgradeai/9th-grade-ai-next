// backend/services/adaptive-exam/live-question-import.ts
// Admin-only preview → approval → import of live-bank rows into the historical
// corpus. Imported rows stay SOURCE_CLAIMED/UNVERIFIED and ineligible for PYQ
// construction until an independent verification path explicitly upgrades them.

import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamProfileId,
  AdaptiveExecutionContext,
  AnswerVerificationPort,
  ExamProfile,
  ExamProfileRegistry,
  HistoricalQuestionRecord,
  ImportReport,
  OptionKey,
} from "./contracts";
import { adaptiveError } from "./errors";
import { historicalQuestionFromRow } from "./historical-import-store";
import {
  createLiveQuestionBridge,
  liveRecordHash,
  type LiveQuestionBridge,
} from "./live-question-bridge";

export type LiveQuestionImportOptions = Readonly<{
  client: PrismaClient;
  bridge?: LiveQuestionBridge;
  verification?: AnswerVerificationPort;
  registry?: ExamProfileRegistry;
  clock: { now(): string };
  requestId: string;
}>;

export type LiveVerificationDecision = {
  recordId: string;
  accepted: boolean;
  status: "CROSS_CHECKED" | "DISPUTED" | "UNVERIFIED";
  reason: string;
  method: "independent-solver" | "deterministic" | "human" | "unverified";
  confidence: number;
  correctOption?: OptionKey;
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function emptyReport(batchId: string, now: string): ImportReport {
  return {
    batchId,
    startedAt: now,
    finishedAt: now,
    totals: {
      extracted: 0,
      parsed: 0,
      imported: 0,
      skipped: 0,
      duplicate: 0,
      unverified: 0,
      failed: 0,
    },
    exceptions: [],
    rollback: {
      procedure: "Set the batch status to ROLLED_BACK; preview rows are invisible to all reads until IMPORTED.",
    },
  };
}

export interface LiveQuestionImportService {
  preview(profile: ExamProfile, options?: { limit?: number }): Promise<{
    batchId: string;
    report: ImportReport;
    records: HistoricalQuestionRecord[];
  }>;
  verifyBatch(batchId: string, profileId: AdaptiveExamProfileId): Promise<{
    batchId: string;
    profileId: AdaptiveExamProfileId;
    decisions: LiveVerificationDecision[];
    accepted: number;
    rejected: number;
    skipped: number;
  }>;
  approve(batchId: string, ctx: AdaptiveExecutionContext): Promise<void>;
  importBatch(batchId: string, ctx: AdaptiveExecutionContext): Promise<ImportReport>;
  rollback(batchId: string, ctx: AdaptiveExecutionContext): Promise<ImportReport>;
}

export function createLiveQuestionImportService(
  options: LiveQuestionImportOptions,
): LiveQuestionImportService {
  const { client, clock, requestId } = options;
  const bridge = options.bridge ?? createLiveQuestionBridge(client, clock);

  function fail(code: Parameters<typeof adaptiveError>[0], message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError(code, message, {
      stage: "historical",
      requestId,
      metadata,
    });
  }

  async function batchFor(batchId: string) {
    const batch = await client.historicalImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) fail("ADAPTIVE_IMPORT_INVALID", "Import batch not found.", { batchId });
    return batch;
  }

  return {
    async preview(profile, previewOptions) {
      const now = clock.now();
      const read = await bridge.read(profile, previewOptions);
      const report = emptyReport("pending", now);
      const batch = await client.historicalImportBatch.create({
        data: {
          id: randomUUID(),
          sourceRef: `live-question-bank:${profile.id}`,
          family: profile.family,
          status: "PREVIEW",
          actorId: null,
          totals: asJson({ extracted: read.records.length + read.issues.length }),
          report: asJson(report),
          startedAt: new Date(now),
        },
      });
      const records: HistoricalQuestionRecord[] = [];
      const seen = new Set<string>();
      for (const record of read.records) {
        const contentHash = liveRecordHash(record);
        if (seen.has(contentHash)) {
          report.totals.duplicate += 1;
          continue;
        }
        seen.add(contentHash);
        const staged: HistoricalQuestionRecord = {
          ...record,
          provenance: { ...record.provenance, importBatchId: batch.id },
        };
        await client.historicalQuestion.create({
          data: {
            id: staged.id,
            family: staged.family,
            organization: staged.organization,
            recruitmentPost: staged.recruitmentPost,
            examinationName: staged.examinationName,
            examYear: staged.examYear ?? null,
            stage: staged.stage,
            subjectId: staged.subjectId,
            subjectName: staged.subjectName,
            topicPath: staged.topicPath,
            subtopicPath: staged.subtopicPath ?? null,
            originalLanguage: staged.originalLanguage,
            questionText: staged.questionText,
            options: asJson(staged.options),
            claimedAnswer: staged.claimedAnswer ?? null,
            verifiedAnswer: null,
            explanation: staged.explanation ?? null,
            verification: staged.verification,
            explanationOrigin: staged.explanationOrigin,
            provenance: asJson(staged.provenance),
            classification: asJson(staged.classification),
            originalSourceText: staged.originalSourceText,
            normalizedText: staged.normalizedText,
            eligibleForPyq: false,
            importBatchId: batch.id,
            contentHash,
          },
        });
        records.push(staged);
        report.totals.parsed += 1;
        if (!staged.claimedAnswer) report.totals.unverified += 1;
      }
      report.batchId = batch.id;
      report.totals.extracted = read.records.length + read.issues.length;
      report.totals.failed = read.issues.length;
      report.exceptions = read.issues.map((issue) => ({
        recordRef: issue.preservedRef,
        stage: "PARSING",
        severity: "warning" as const,
        reason: issue.reason,
        preservedRef: issue.preservedRef,
      }));
      report.finishedAt = clock.now();
      await client.historicalImportBatch.update({
        where: { id: batch.id },
        data: { totals: asJson(report.totals), report: asJson(report), finishedAt: new Date(report.finishedAt) },
      });
      return { batchId: batch.id, report, records };
    },

    async verifyBatch(batchId, profileId) {
      const batch = await batchFor(batchId);
      if (batch.status !== "PREVIEW") {
        fail("ADAPTIVE_IMPORT_CONFLICT", "Only a PREVIEW batch can be verified.", {
          batchId,
          status: batch.status,
        });
      }
      if (options.registry) {
        const profile = await options.registry.resolve(profileId);
        if (!profile) {
          fail("ADAPTIVE_PROFILE_NOT_FOUND", "Cannot verify against an unknown profile.", { profileId });
        }
      }
      const verifier = options.verification;
      if (!verifier) {
        fail("ADAPTIVE_DEPENDENCY_UNAVAILABLE", "No independent answer verifier is configured.");
      }

      const rows = await client.historicalQuestion.findMany({
        where: { importBatchId: batchId },
        orderBy: { id: "asc" },
      });
      const decisions: LiveVerificationDecision[] = [];
      let accepted = 0;
      let rejected = 0;
      let skipped = 0;

      for (const row of rows) {
        const record = historicalQuestionFromRow(row);
        if (!record.claimedAnswer) {
          await client.historicalQuestion.update({
            where: { id: row.id },
            data: { verification: "UNVERIFIED", verifiedAnswer: null, eligibleForPyq: false },
          });
          decisions.push({
            recordId: row.id,
            accepted: false,
            status: "UNVERIFIED",
            reason: "No source-claimed answer was available to verify.",
            method: "unverified",
            confidence: 0,
          });
          skipped += 1;
          continue;
        }
        const decision = await verifier.verify({
          questionText: record.questionText,
          options: record.options,
          claimedOption: record.claimedAnswer,
          language: record.originalLanguage,
          subjectId: record.subjectId,
          topicPath: record.topicPath,
          profileId,
        });
        const status = decision.accepted ? "CROSS_CHECKED" : "DISPUTED";
        await client.historicalQuestion.update({
          where: { id: row.id },
          data: {
            verifiedAnswer: decision.accepted ? decision.correctOption ?? null : null,
            verification: status,
            eligibleForPyq: decision.accepted,
          },
        });
        decisions.push({
          recordId: row.id,
          accepted: decision.accepted,
          status,
          reason: decision.reason,
          method: decision.method,
          confidence: decision.confidence,
          ...(decision.accepted && decision.correctOption
            ? { correctOption: decision.correctOption }
            : {}),
        });
        if (decision.accepted) accepted += 1;
        else rejected += 1;
      }

      return { batchId, profileId, decisions, accepted, rejected, skipped };
    },

    async approve(batchId, ctx) {
      const batch = await batchFor(batchId);
      if (batch.status !== "PREVIEW") {
        fail("ADAPTIVE_IMPORT_CONFLICT", "Only a PREVIEW batch can be approved.", {
          batchId,
          status: batch.status,
        });
      }
      await client.historicalImportBatch.update({
        where: { id: batchId },
        data: { status: "APPROVED", actorId: ctx.userId },
      });
    },

    async importBatch(batchId, ctx) {
      const batch = await batchFor(batchId);
      if (batch.status !== "APPROVED") {
        fail("ADAPTIVE_IMPORT_CONFLICT", "Only an APPROVED batch can be imported.", {
          batchId,
          status: batch.status,
        });
      }
      const count = await client.historicalQuestion.count({ where: { importBatchId: batchId } });
      const report = emptyReport(batchId, clock.now());
      report.totals.imported = count;
      report.totals.parsed = count;
      report.finishedAt = clock.now();
      // Eligibility is set only by the independent verification step. Importing
      // an approved batch must not silently overwrite verified decisions.
      await client.historicalImportBatch.update({
        where: { id: batchId },
        data: {
          status: "IMPORTED",
          actorId: ctx.userId,
          totals: asJson(report.totals),
          report: asJson(report),
          finishedAt: new Date(report.finishedAt),
        },
      });
      return report;
    },

    async rollback(batchId, ctx) {
      const batch = await batchFor(batchId);
      if (batch.status === "IMPORTED" && new Date(batch.createdAt).getTime() < Date.now() - 24 * 60 * 60 * 1000) {
        fail("ADAPTIVE_IMPORT_CONFLICT", "Rollback window has closed.", { batchId });
      }
      const report = emptyReport(batchId, clock.now());
      report.finishedAt = clock.now();
      await client.historicalImportBatch.update({
        where: { id: batchId },
        data: { status: "ROLLED_BACK", actorId: ctx.userId, report: asJson(report) },
      });
      return report;
    },
  };
}

// backend/services/adaptive-exam/prisma-score-report-store.ts
// Immutable score + performance report storage. One row per attempt; a second
// write is a no-op so concurrent submits cannot produce two reports.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type { PerformanceReport, ScoreReport, ScoreReportStore } from "./contracts";
import { hashSnapshot } from "./hash";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function scoreFromJson(value: unknown): ScoreReport | null {
  return value && typeof value === "object" ? (value as ScoreReport) : null;
}

function reportFromJson(value: unknown): PerformanceReport | null {
  return value && typeof value === "object" ? (value as PerformanceReport) : null;
}

export function createPrismaScoreReportStore(client: PrismaClient): ScoreReportStore {
  return {
    async put({ score, report, candidateSnapshotHash }) {
      const contentHash = hashSnapshot({ score, report });
      try {
        await client.adaptiveScoreReport.create({
          data: {
            attemptId: score.attemptId,
            paperId: score.paperId,
            profileId: score.profileId,
            profileVersion: score.profileVersion,
            scoring: asJson(score.scoring),
            score: asJson(score),
            report: asJson(report),
            contentHash,
            candidateSnapshotHash: candidateSnapshotHash ?? null,
          },
        });
      } catch (error) {
        if ((error as { code?: string })?.code !== "P2002") throw error;
      }
    },
    async getScore(attemptId) {
      const row = await client.adaptiveScoreReport.findUnique({ where: { attemptId } });
      return row ? scoreFromJson(row.score) : null;
    },
    async getReport(attemptId) {
      const row = await client.adaptiveScoreReport.findUnique({ where: { attemptId } });
      return row ? reportFromJson(row.report) : null;
    },
  };
}

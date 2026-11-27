// backend/services/adaptive-exam/prisma-generation-job-store.ts
// Durable generation-job state for serverless recovery and progress polling.

import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  EntityId,
  GenerationJob,
  GenerationJobStage,
  GenerationJobStore,
} from "./contracts";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function rowToJob(row: {
  id: string;
  userId: string;
  blueprintId: string;
  idempotencyKey: string;
  status: string;
  stage: string;
  progress: number;
  total: number;
  paperId: string | null;
  attempts: number;
  error: unknown;
  telemetry: unknown;
  createdAt: Date;
  updatedAt: Date;
}): GenerationJob {
  return {
    id: row.id,
    userId: row.userId,
    blueprintId: row.blueprintId,
    idempotencyKey: row.idempotencyKey,
    status: row.status as GenerationJob["status"],
    stage: row.stage as GenerationJobStage,
    progress: row.progress,
    total: row.total,
    ...(row.paperId ? { paperId: row.paperId } : {}),
    attempts: row.attempts,
    ...(row.error && typeof row.error === "object"
      ? { error: row.error as Record<string, unknown> }
      : {}),
    ...(row.telemetry && typeof row.telemetry === "object"
      ? { telemetry: row.telemetry as GenerationJob["telemetry"] }
      : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createPrismaGenerationJobStore(client: PrismaClient): GenerationJobStore {
  return {
    async put(job) {
      const data = {
        userId: job.userId,
        blueprintId: job.blueprintId,
        idempotencyKey: job.idempotencyKey,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        total: job.total,
        paperId: job.paperId ?? null,
        attempts: job.attempts,
        error: job.error ? (asJson(job.error) as Prisma.InputJsonValue) : Prisma.JsonNull,
        telemetry: job.telemetry ? (asJson(job.telemetry) as Prisma.InputJsonValue) : Prisma.JsonNull,
      };
      const existing = await client.adaptiveGenerationJob.findUnique({
        where: { id: job.id },
        select: { id: true },
      });
      if (existing) {
        await client.adaptiveGenerationJob.update({ where: { id: job.id }, data });
        return job;
      }
      const row = await client.adaptiveGenerationJob.create({
        data: { id: job.id, ...data },
      });
      return rowToJob(row);
    },
    async get(jobId: EntityId) {
      const row = await client.adaptiveGenerationJob.findUnique({ where: { id: jobId } });
      return row ? rowToJob(row) : null;
    },
    async findByIdempotencyKey(userId, key) {
      const row = await client.adaptiveGenerationJob.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      return row ? rowToJob(row) : null;
    },
  };
}

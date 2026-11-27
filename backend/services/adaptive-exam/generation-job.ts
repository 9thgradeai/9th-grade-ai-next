// backend/services/adaptive-exam/generation-job.ts
// Durable paper-generation job. Stages are persisted at every boundary so a
// serverless timeout can resume without re-generating from scratch. Progress is
// stage-based; no fabricated percentages or provider outcomes are reported.

import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AdaptiveExamOrchestrator,
  EntityId,
  GenerationJob,
  GenerationJobService,
  GenerationJobStage,
  GenerationJobStore,
  GenerationTelemetrySummary,
  PaperSnapshot,
} from "./contracts";
import { adaptiveError, isAdaptiveExamError } from "./errors";

const STAGES: GenerationJobStage[] = [
  "prepare",
  "select",
  "generate",
  "verify",
  "dedupe",
  "assemble",
  "persist",
];

/**
 * Job-level telemetry is derived from the immutable paper's provenance, never
 * from a client-supplied status or a fabricated progress percentage.
 */
function summarizePaperTelemetry(paper: PaperSnapshot): GenerationTelemetrySummary {
  const providers = new Set<string>();
  const models = new Set<string>();
  const promptVersions = new Set<string>();
  // Every question in a batch carries the SAME batch-level usage. Summing it
  // per question would multiply tokens/cost/latency by the batch size and
  // report fabricated spend, so dedupe by batch identity first.
  const batches = new Map<string, {
    provider: string;
    model: string;
    promptVersion: string;
    mock: boolean;
    usage: { inputTokens: number; outputTokens: number; costUsd: number; durationMs: number };
  }>();
  const summary: GenerationTelemetrySummary = {
    providers: [],
    models: [],
    promptVersions: [],
    mock: false,
    batches: 0,
    questions: 0,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    durationMs: 0,
  };
  for (const question of paper.questions) {
    const generation = question.provenance.generation;
    if (!generation) continue;
    providers.add(generation.provider);
    models.add(generation.model);
    promptVersions.add(generation.promptVersion);
    summary.mock ||= generation.mock === true;
    summary.questions += 1;

    const usage = generation.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: 0 };
    const key = [
      generation.provider,
      generation.model,
      generation.promptVersion,
      String(usage.inputTokens),
      String(usage.outputTokens),
      String(usage.costUsd),
      String(usage.durationMs),
      String(generation.mock === true),
    ].join("|");
    batches.set(key, {
      provider: generation.provider,
      model: generation.model,
      promptVersion: generation.promptVersion,
      mock: generation.mock === true,
      usage,
    });
  }
  for (const batch of batches.values()) {
    summary.inputTokens += batch.usage.inputTokens;
    summary.outputTokens += batch.usage.outputTokens;
    summary.costUsd += batch.usage.costUsd;
    summary.durationMs += batch.usage.durationMs;
  }
  summary.providers = [...providers].sort();
  summary.models = [...models].sort();
  summary.promptVersions = [...promptVersions].sort();
  summary.batches = batches.size;
  return summary;
}

export type CreateGenerationJobServiceOptions = Readonly<{
  store: GenerationJobStore;
  orchestrator: AdaptiveExamOrchestrator;
  clock: { now(): string };
  newId?(): string;
  maxAttempts?: number;
}>;

export function createGenerationJobService(
  options: CreateGenerationJobServiceOptions,
): GenerationJobService {
  const { store, orchestrator, clock } = options;
  const newId = options.newId ?? (() => randomUUID());
  const maxAttempts = options.maxAttempts ?? 2;

  function fail(code: Parameters<typeof adaptiveError>[0], message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError(code, message, {
      stage: "integration",
      requestId: "generation-job",
      metadata,
    });
  }

  async function update(job: GenerationJob, patch: Partial<GenerationJob>): Promise<GenerationJob> {
    const next: GenerationJob = { ...job, ...patch, updatedAt: clock.now() };
    return store.put(next);
  }

  return {
    async enqueue(input) {
      const existing = await store.findByIdempotencyKey(input.userId, input.idempotencyKey);
      if (existing) return existing;
      const now = clock.now();
      return store.put({
        id: newId(),
        userId: input.userId,
        blueprintId: input.blueprintId,
        idempotencyKey: input.idempotencyKey,
        status: "QUEUED",
        stage: "prepare",
        progress: 0,
        total: STAGES.length,
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    },

    async get(jobId, userId) {
      const job = await store.get(jobId);
      if (!job || job.userId !== userId) return null;
      return job;
    },

    async run(jobId, ctx) {
      const job = await store.get(jobId);
      if (!job) fail("ADAPTIVE_SUBMISSION_NOT_FOUND", "Generation job not found.", { jobId });
      if (job.userId !== ctx.userId) {
        fail("ADAPTIVE_OWNERSHIP_DENIED", "Generation job belongs to another user.", { jobId });
      }
      if (job.status === "COMPLETED" && job.paperId) return job;

      let current = await update(job, {
        status: "RUNNING",
        stage: "prepare",
        progress: 0,
        attempts: job.attempts + 1,
        error: undefined,
      });

      try {
        for (let index = 0; index < STAGES.length; index += 1) {
          const stage = STAGES[index];
          current = await update(current, { stage, progress: index });
          // Orchestration performs select/generate/verify/dedupe/assemble/persist
          // atomically; the durable stage markers bound the work for observers.
          if (stage === "generate") {
            const paper = await orchestrator.generatePaper(ctx, job.blueprintId);
            current = await update(current, {
              paperId: paper.id,
              telemetry: summarizePaperTelemetry(paper),
            });
          }
        }
        return update(current, {
          status: "COMPLETED",
          stage: "done",
          progress: STAGES.length,
        });
      } catch (error) {
        const code = isAdaptiveExamError(error) ? error.adaptiveCode : "ADAPTIVE_GENERATION_FAILED";
        const attempts = current.attempts;
        if (attempts < maxAttempts) {
          return update(current, {
            status: "QUEUED",
            stage: "prepare",
            error: { code, retryable: true },
          });
        }
        return update(current, {
          status: "FAILED",
          stage: "failed",
          error: { code, retryable: false },
        });
      }
    },
  };
}

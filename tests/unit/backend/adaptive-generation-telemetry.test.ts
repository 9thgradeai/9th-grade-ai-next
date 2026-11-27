import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdaptiveExecutionContext,
  AdaptiveExamOrchestrator,
  GenerationJob,
  PaperSnapshot,
} from "~backend/services/adaptive-exam/contracts";

const { recordUsage, resolveCandidates, reportOutcome, generate } = vi.hoisted(() => ({
  recordUsage: vi.fn(async () => undefined),
  resolveCandidates: vi.fn(),
  reportOutcome: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("~backend/ai/usage/usage", () => ({ recordUsage }));
vi.mock("~backend/ai/providers/registry", () => ({
  resolveCandidatesForModelTask: resolveCandidates,
  reportProviderOutcome: reportOutcome,
}));
vi.mock("~backend/ai/infrastructure/retry", () => ({
  withRetry: async (fn: () => Promise<unknown>) => ({
    result: await fn(),
    attempts: 1,
    totalMs: 777,
  }),
}));

import {
  ADAPTIVE_GENERATION_INTENT,
  createAdaptiveGenerationTelemetryRecorder,
} from "~backend/services/adaptive-exam/adaptive-generation-telemetry";
import { createAiGenerationAdapter } from "~backend/services/adaptive-exam/ai-generation-adapter";
import { createGenerationJobService } from "~backend/services/adaptive-exam/generation-job";

const ctx: AdaptiveExecutionContext = {
  userId: "user-1",
  requestId: "request-1",
  ports: {} as AdaptiveExecutionContext["ports"],
};

describe("adaptive generation telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends every batch to the shared ledger with real tokens, cost and latency", async () => {
    const recorder = createAdaptiveGenerationTelemetryRecorder();
    await recorder(
      [{
        provider: "groq",
        model: "openai/gpt-oss-120b",
        promptVersion: "adaptive-generation-v1",
        mock: false,
        batches: 1,
        questions: 5,
        inputTokens: 120,
        outputTokens: 340,
        costUsd: 0.0012,
        durationMs: 777,
      }],
      ctx,
    );

    expect(recordUsage).toHaveBeenCalledTimes(1);
    const row = recordUsage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      userId: "user-1",
      task: "agent",
      intent: ADAPTIVE_GENERATION_INTENT,
      provider: "groq",
      model: "openai/gpt-oss-120b",
      inputTokens: 120,
      outputTokens: 340,
      latencyMs: 777,
      success: true,
      estimatedCostUsd: 0.0012,
    });
    expect(JSON.stringify(row)).not.toMatch(/questionText|correctOption|claimedAnswer/);
  });

  it("records provider usage and latency on every generated question's provenance", async () => {
    generate.mockResolvedValueOnce({
      text: JSON.stringify({
        questions: Array.from({ length: 5 }, (_, index) => ({
          questionText: `Question ${index + 1} about grammar?`,
          options: { A: "a", B: "b", C: "c", D: "d" },
          correctOption: "A",
          explanation: " explanation ",
          topicPath: "english.language",
          difficulty: "MEDIUM",
        })),
      }),
      model: "openai/gpt-oss-120b",
      inputTokens: 100,
      outputTokens: 200,
      estimatedCostUsd: 0.001,
    });
    resolveCandidates.mockReturnValueOnce([{ name: "groq", provider: { generate } }]);

    const result = await createAiGenerationAdapter().generate({
      profileId: "BCS_PRELIMINARY",
      profileVersion: 1,
      subjectId: "bcs.english",
      language: "en",
      difficulty: "MEDIUM",
      count: 5,
      sourceType: "ORIGINAL",
      instructions: "test",
      requestId: "request-1",
      userId: "user-1",
    });

    expect(result.durationMs).toBe(777);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 200, costUsd: 0.001, durationMs: 777 });
    expect(result.questions[0]?.provenance.generation?.usage).toEqual(result.usage);
    expect(reportOutcome).toHaveBeenCalledWith("groq", true);
  });

  it("rolls paper provenance into durable job telemetry without exposing answers", async () => {
    let stored: GenerationJob | null = null;
    const store = {
      put: async (job: GenerationJob) => {
        stored = job;
        return job;
      },
      get: async () => stored,
      findByIdempotencyKey: async () => stored,
    };
    // Three questions from ONE provider batch: the batch-level usage is copied
    // onto each question and must be summed only once in the job rollup.
    const batchProvenance = {
      sourceType: "ORIGINAL" as const,
      generation: {
        provider: "groq",
        model: "openai/gpt-oss-120b",
        promptVersion: "adaptive-generation-v1",
        repairAttempts: 0,
        mock: false,
        usage: { inputTokens: 100, outputTokens: 200, costUsd: 0.001, durationMs: 777 },
      },
    };
    const paper = {
      id: "paper-1",
      blueprintId: "blueprint-1",
      questions: [1, 2, 3].map((position) => ({
        position,
        sourceType: "ORIGINAL",
        subjectId: "bcs.english",
        subjectName: "English",
        topicPath: "english.language",
        language: "en",
        difficulty: "MEDIUM",
        questionText: `Question ${position}`,
        options: { A: "a", B: "b", C: "c", D: "d" },
        provenance: batchProvenance,
        marks: 1,
      })),
    } as unknown as PaperSnapshot;
    const orchestrator = { generatePaper: async () => paper } as unknown as AdaptiveExamOrchestrator;
    const service = createGenerationJobService({
      store,
      orchestrator,
      clock: { now: () => "2026-11-28T00:00:00.000Z" },
    });

    const queued = await service.enqueue({
      userId: "user-1",
      blueprintId: "blueprint-1",
      idempotencyKey: "telemetry-key-1",
    });
    const completed = await service.run(queued.id, ctx);

    expect(completed.status).toBe("COMPLETED");
    expect(completed.telemetry).toEqual({
      providers: ["groq"],
      models: ["openai/gpt-oss-120b"],
      promptVersions: ["adaptive-generation-v1"],
      mock: false,
      batches: 1,
      questions: 3,
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.001,
      durationMs: 777,
    });
    expect(JSON.stringify(completed.telemetry)).not.toMatch(/Question 1|correctOption/);
  });
});

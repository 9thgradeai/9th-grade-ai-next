// backend/services/adaptive-exam/adaptive-generation-telemetry.ts
// Appends adaptive question-generation batches to the shared AIUsage ledger.
// No prompt, question text, option, answer or secret crosses this boundary.

import "server-only";

import { recordUsage } from "~backend/ai/usage/usage";
import type {
  AdaptiveExecutionContext,
  AdaptiveGenerationTelemetryRecorder,
} from "./contracts";

export const ADAPTIVE_GENERATION_INTENT = "adaptive_exam_question_generation";

/**
 * Production recorder. The shared ledger is the single durable source of
 * provider/model/token/latency/cost truth for every real provider batch.
 */
export function createAdaptiveGenerationTelemetryRecorder(): AdaptiveGenerationTelemetryRecorder {
  return async (records: Parameters<AdaptiveGenerationTelemetryRecorder>[0], ctx: AdaptiveExecutionContext) => {
    for (const record of records) {
      await recordUsage({
        userId: ctx.userId,
        // "agent" maps to the ASSISTANT ledger task; it is not a learner chat.
        task: "agent",
        intent: ADAPTIVE_GENERATION_INTENT,
        provider: record.provider,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        latencyMs: record.durationMs,
        success: true,
        errorCode: "",
        estimatedCostUsd: record.costUsd,
      });
    }
  };
}

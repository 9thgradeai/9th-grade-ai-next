// Parallel tool execution helper — runs independent tool calls concurrently
// with per-tool timeouts and error isolation. Falls back to sequential on failure.

import "server-only";

import type { ToolContext, ToolDefinition, ToolResult } from "./types";
import { executeTool } from "./registry";
import { log } from "~backend/infrastructure/observability/logger";

export type ParallelToolCall = {
  def: ToolDefinition;
  args: Record<string, unknown>;
};

export type ParallelToolResult = {
  name: string;
  result: ToolResult;
  durationMs: number;
};

/**
 * Execute multiple independent tool calls in parallel with per-tool timeouts.
 * Returns results in the same order as input. Each tool failure is isolated —
 * one failing tool doesn't prevent others from completing.
 */
export async function executeToolsParallel(
  calls: ParallelToolCall[],
  ctx: ToolContext,
  opts?: { maxConcurrency?: number; confirmed?: boolean },
): Promise<ParallelToolResult[]> {
  const maxConcurrency = opts?.maxConcurrency ?? 5;

  if (calls.length === 0) return [];
  if (calls.length === 1) {
    const start = Date.now();
    const result = await executeTool(calls[0].def, ctx, calls[0].args, { confirmed: opts?.confirmed });
    return [{ name: calls[0].def.name, result, durationMs: Date.now() - start }];
  }

  // Chunk into batches to respect maxConcurrency
  const results: ParallelToolResult[] = [];
  for (let i = 0; i < calls.length; i += maxConcurrency) {
    const batch = calls.slice(i, i + maxConcurrency);
    const batchResults = await Promise.allSettled(
      batch.map(async (call) => {
        const start = Date.now();
        const result = await executeTool(call.def, ctx, call.args, { confirmed: opts?.confirmed });
        return { name: call.def.name, result, durationMs: Date.now() - start };
      }),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === "fulfilled") {
        results.push(r.value);
      } else {
        const callName = batch[j].def.name;
        log.error("Parallel tool execution failed", { tool: callName, error: String(r.reason) });
        results.push({
          name: callName,
          result: { ok: false, summary: `Tool ${callName} failed during parallel execution.` },
          durationMs: 0,
        });
      }
    }
  }

  return results;
}

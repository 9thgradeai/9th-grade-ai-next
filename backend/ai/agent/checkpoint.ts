// Agent checkpoint system — allows the agent loop to save and resume state
// from the last successful tool call. Enables retry-on-interruption and
// crash recovery.

import "server-only";

import type { AIMessageInput } from "../types";
import { log } from "~backend/infrastructure/observability/logger";

export type AgentCheckpoint = {
  /** Unique checkpoint ID. */
  id: string;
  /** The run ID this checkpoint belongs to. */
  runId: string;
  /** Step number at which this checkpoint was taken. */
  step: number;
  /** Conversation history up to this point. */
  history: AIMessageInput[];
  /** Tool results accumulated in this session. */
  sessionToolResults: Record<string, { questionIds?: unknown }>;
  /** Provider being used. */
  provider: string;
  /** Model being used. */
  model: string;
  /** Timestamp when checkpoint was created. */
  createdAt: number;
};

// In-memory checkpoint store (last 100 checkpoints per run)
const MAX_CHECKPOINTS = 100;
const checkpointsByRun = new Map<string, AgentCheckpoint[]>();

/**
 * Save a checkpoint after a successful tool call.
 * Returns the checkpoint ID for later retrieval.
 */
export function saveCheckpoint(checkpoint: Omit<AgentCheckpoint, "id" | "createdAt">): string {
  const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const full: AgentCheckpoint = { ...checkpoint, id, createdAt: Date.now() };

  const existing = checkpointsByRun.get(checkpoint.runId) ?? [];
  existing.push(full);
  if (existing.length > MAX_CHECKPOINTS) existing.shift();
  checkpointsByRun.set(checkpoint.runId, existing);

  log.debug("Agent checkpoint saved", { runId: checkpoint.runId, step: checkpoint.step, id });
  return id;
}

/**
 * Retrieve the latest checkpoint for a run.
 * Returns undefined if no checkpoints exist.
 */
export function getLatestCheckpoint(runId: string): AgentCheckpoint | undefined {
  const existing = checkpointsByRun.get(runId);
  return existing?.[existing.length - 1];
}

/**
 * Retrieve a specific checkpoint by ID.
 */
export function getCheckpoint(runId: string, checkpointId: string): AgentCheckpoint | undefined {
  const existing = checkpointsByRun.get(runId);
  return existing?.find((cp) => cp.id === checkpointId);
}

/**
 * Clear all checkpoints for a run (call when run completes/fails).
 */
export function clearCheckpoints(runId: string): void {
  checkpointsByRun.delete(runId);
  log.debug("Agent checkpoints cleared", { runId });
}

/**
 * Get checkpoint count for a run (for observability).
 */
export function getCheckpointCount(runId: string): number {
  return checkpointsByRun.get(runId)?.length ?? 0;
}

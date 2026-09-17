// AI model task taxonomy — every AI operation maps to a ModelTask, which the
// router maps to a tier (fast vs primary) and from there to a concrete model.

import "server-only";

import type { AITier } from "./config";

export type ModelTask =
  // ── Fast tier (cheap, low-latency — good for high-frequency ops) ──
  | "classification"
  | "extraction"
  | "summary"
  | "simple_tutoring"
  // ── Primary tier (reasoning-heavy — quality over latency) ──
  | "complex_tutoring"
  | "student_analysis"
  | "study_planning"
  | "question_generation"
  | "exam_generation"
  | "agent_reasoning";

const FAST_TASKS: ReadonlySet<ModelTask> = new Set<ModelTask>([
  "classification",
  "extraction",
  "summary",
  "simple_tutoring",
]);

/** Tier classification for a task — drives which model gets used. */
export function tierForTask(task: ModelTask): AITier {
  return FAST_TASKS.has(task) ? "fast" : "primary";
}
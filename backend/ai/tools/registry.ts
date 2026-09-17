// Tool registry — maps tool names to definitions; provides timeout-enforced
// execution so a misbehaving tool never deadlocks the agent loop.
// Records metrics, classifies permissions, validates inputs/outputs, and
// enforces write-tool confirmation.

import "server-only";

import { ValidationError } from "~backend/errors";
import { recordToolExecution } from "../infrastructure/metrics";
import { isCircuitClosed, recordSuccess as recordCircuitSuccess, recordFailure as recordCircuitFailure } from "../infrastructure/circuit-breaker";
import type { ToolContext, ToolDefinition, ToolResult } from "./types";
import { getMyProfile, getMyGoals } from "./profile";
import {
  getMyMastery,
  getRecentActivity,
  getQuestionHistory,
  calculateReadiness,
} from "./performance";
import {
  getWrongAnswers,
  searchQuestions,
  getQuestion,
  searchSyllabus,
  getTopic,
  getExamWeightage,
  searchCurrentAffairs,
} from "./knowledge";
import { createPracticeSession, createMockExam } from "./session";
import { recommendNextAction } from "./planner";
import { analyzeMyMistakes } from "./mistakes";
import { createStudyTaskTool } from "./study";
import { log } from "~backend/infrastructure/observability/logger";

const REGISTRY: ToolDefinition[] = [
  getMyProfile,
  getMyGoals,
  getMyMastery,
  getRecentActivity,
  getQuestionHistory,
  getWrongAnswers,
  searchQuestions,
  getQuestion,
  searchSyllabus,
  getTopic,
  getExamWeightage,
  calculateReadiness,
  recommendNextAction,
  searchCurrentAffairs,
  createPracticeSession,
  createMockExam,
  analyzeMyMistakes,
  createStudyTaskTool,
];

const BY_NAME = new Map(REGISTRY.map((t) => [t.name, t]));

/** Return every tool definition (for the system prompt / tool listing). */
export function getTools(): ToolDefinition[] {
  return [...REGISTRY];
}

/** Look up a tool by name — returns undefined if the model invents a name. */
export function findTool(name: string): ToolDefinition | undefined {
  return BY_NAME.get(name);
}

/** Return all tools classified by access level. */
export function getToolsByAccess(): { read: ToolDefinition[]; write: ToolDefinition[] } {
  const read: ToolDefinition[] = [];
  const write: ToolDefinition[] = [];
  for (const tool of REGISTRY) {
    if (tool.access === "write") {
      write.push(tool);
    } else {
      read.push(tool);
    }
  }
  return { read, write };
}

/** Return tools that require human confirmation. */
export function getConfirmationRequiredTools(): ToolDefinition[] {
  return REGISTRY.filter((t) => t.confirmation === "required");
}

/** Parse a tool-call JSON object. Throws ValidationError on malformed input. */
export function parseToolCall(raw: unknown): { name: string; arguments: Record<string, unknown> } {
  if (!raw || typeof raw !== "object") throw new ValidationError("Tool call must be an object.");
  const obj = raw as Record<string, unknown>;
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  if (!name) throw new ValidationError("Tool call missing name.");
  const args =
    obj.arguments && typeof obj.arguments === "object" && obj.arguments !== null
      ? (obj.arguments as Record<string, unknown>)
      : {};
  return { name, arguments: args };
}

/**
 * Validate tool result against a basic schema.
 * Returns { valid: true, result } or { valid: false, error }.
 */
export function validateToolResult(
  def: ToolDefinition,
  result: unknown,
): { valid: true; result: ToolResult } | { valid: false; error: string } {
  if (!result || typeof result !== "object") {
    return { valid: false, error: `Tool ${def.name} returned non-object result.` };
  }
  const r = result as Record<string, unknown>;
  if (typeof r.summary !== "string" || r.summary.trim().length === 0) {
    return { valid: false, error: `Tool ${def.name} returned empty summary.` };
  }
  if (r.data !== undefined && (typeof r.data !== "object" || r.data === null)) {
    return { valid: false, error: `Tool ${def.name} returned invalid data (must be object or undefined).` };
  }
  if (r.action !== undefined) {
    if (typeof r.action !== "object" || r.action === null) {
      return { valid: false, error: `Tool ${def.name} returned invalid action.` };
    }
    const a = r.action as Record<string, unknown>;
    if (typeof a.type !== "string" || typeof a.label !== "string") {
      return { valid: false, error: `Tool ${def.name} action missing type or label.` };
    }
  }
  return { valid: true, result: result as ToolResult };
}

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Execute a single tool with a hard timeout so a hanging DB query cannot
 * deadlock the agent loop. Records metrics, validates output, checks circuit
 * breaker state, and enforces write-tool confirmation.
 */
export async function executeTool(
  def: ToolDefinition,
  ctx: ToolContext,
  args: Record<string, unknown>,
  opts?: { skipCircuitCheck?: boolean; confirmed?: boolean },
): Promise<ToolResult> {
  const timeoutMs = def.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startMs = Date.now();

  // Check circuit breaker — open circuit short-circuits the tool
  if (!opts?.skipCircuitCheck && !isCircuitClosed(def.name)) {
    recordToolExecution(def.name, 0, false);
    return {
      ok: false,
      summary: `Tool ${def.name} is temporarily unavailable (circuit breaker open). Try a different approach.`,
    };
  }

  // Check write-tool confirmation
  if (def.confirmation === "required" && !opts?.confirmed) {
    return {
      ok: false,
      summary: `Tool ${def.name} requires user confirmation. Please ask the user to confirm this action before proceeding.`,
    };
  }

  let id: ReturnType<typeof setTimeout> | undefined;

  try {
    const validated = def.validateInput(args);
    const execPromise = def.execute(ctx, validated);

    const result = await Promise.race<ToolResult>([
      new Promise<ToolResult>((_, reject) => {
        id = setTimeout(() => reject(new ToolTimeoutError(def.name)), timeoutMs);
      }),
      execPromise,
    ]);

    if (id) clearTimeout(id);
    const durationMs = Date.now() - startMs;

    // Validate tool result
    const validation = validateToolResult(def, result);
    if (!validation.valid) {
      log.warn("Tool result validation failed", { tool: def.name, error: validation.error });
      recordToolExecution(def.name, durationMs, false);
      recordCircuitFailure(def.name);
      return { ok: false, summary: validation.error };
    }

    recordToolExecution(def.name, durationMs, true);
    recordCircuitSuccess(def.name);
    return validation.result;
  } catch (err) {
    if (id) clearTimeout(id);
    const durationMs = Date.now() - startMs;
    recordCircuitFailure(def.name);

    if (err instanceof ToolTimeoutError) {
      recordToolExecution(def.name, durationMs, false);
      return { ok: false, summary: `Tool ${def.name} timed out after ${timeoutMs}ms.` };
    }
    recordToolExecution(def.name, durationMs, false);
    return {
      ok: false,
      summary: `Tool ${def.name} failed: ${err instanceof Error ? err.message : "unknown error"}.`,
    };
  }
}

class ToolTimeoutError extends Error {
  readonly tool: string;
  constructor(tool: string) {
    super(`Tool timed out: ${tool}`);
    this.tool = tool;
  }
}
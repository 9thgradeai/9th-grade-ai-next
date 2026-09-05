// Tool registry — maps tool names to definitions; provides timeout-enforced
// execution so a misbehaving tool never deadlocks the agent loop.

import "server-only";

import { ValidationError } from "~backend/errors";
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

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Execute a single tool with a hard timeout so a hanging DB query cannot
 * deadlock the agent loop. On failure, returns ok:false with an error summary
 * the model can interpret and adapt to.
 */
export async function executeTool(
  def: ToolDefinition,
  ctx: ToolContext,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const timeoutMs = def.timeoutMs ?? DEFAULT_TIMEOUT_MS;
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
    return result;
  } catch (err) {
    if (id) clearTimeout(id);
    if (err instanceof ToolTimeoutError) {
      return { ok: false, summary: `Tool ${def.name} timed out after ${timeoutMs}ms.` };
    }
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
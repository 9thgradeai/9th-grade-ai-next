// AI agent tool contract — identity, results, and action affordances.

export type AgentActionType =
  | "practice"
  | "revision"
  | "mock_exam"
  | "open_tab"
  | "open_question"
  | "open_wrong_answers"
  | "open_study_plan"
  | "refresh";

export type AgentAction = {
  type: AgentActionType;
  label: string;
  params?: Record<string, unknown>;
};

/** Execution context — identity always comes from the authenticated request. */
export type ToolContext = {
  userId: string;
  conversationId?: string;
};

export type ToolResult = {
  /** Concise, human-readable summary the LLM sees in the tool transcript. */
  summary: string;
  /** Optional structured payload the frontend can render as blocks/cards. */
  data?: Record<string, unknown>;
  /** Optional single best-action to surface as a card CTA. */
  action?: AgentAction;
  /** Set on failure — the loop presents it to the model as a tool error. */
  ok?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON-schema-like description embedded in the system prompt. */
  inputShape: string;
  /** Normalize + validate raw arguments; throws ValidationError on bad input. */
  validateInput(raw: unknown): Record<string, unknown>;
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
  timeoutMs?: number;
};

// ── Tiny argument validators (repo convention: dependency-free, no zod) ──

const MAX_STR = 200;

export function str(
  args: Record<string, unknown>,
  key: string,
  def = "",
  maxLen = MAX_STR,
): string {
  const v = args[key];
  return typeof v === "string" ? v.trim().slice(0, maxLen) : def;
}

export function posInt(args: Record<string, unknown>, key: string, def?: number): number | undefined {
  const v = args[key];
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return def;
}

export function num(args: Record<string, unknown>, key: string, def: number): number {
  const v = args[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : def;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
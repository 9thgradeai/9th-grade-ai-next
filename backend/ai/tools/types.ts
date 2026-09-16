// AI agent tool contract — identity, results, and action affordances.
// Enhanced with permission classification, result validation, and provenance.

// ── Permission classification ──────────────────────────────

/** Whether a tool modifies user/system state. */
export type ToolAccess = "read" | "write";

/** Whether a tool requires human confirmation before execution. */
export type ToolConfirmation = "none" | "required";

/** Whether a tool is idempotent (safe to retry). */
export type ToolIdempotency = "idempotent" | "non_idempotent";

// ── Existing types ─────────────────────────────────────────

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
  /** Provenance: where the data came from (for citation/tracking). */
  provenance?: ToolProvenance;
};

/** Provenance metadata for tool results — tracks where data came from. */
export type ToolProvenance = {
  /** Source type: database, computed, external API, etc. */
  source: "database" | "computed" | "external" | "seed";
  /** Specific table/query/API endpoint used. */
  reference?: string;
  /** Timestamp when data was fetched. */
  fetchedAt?: number;
  /** Number of records returned. */
  recordCount?: number;
};

// ── Enhanced ToolDefinition ────────────────────────────────

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON-schema-like description embedded in the system prompt. */
  inputShape: string;
  /** Normalize + validate raw arguments; throws ValidationError on bad input. */
  validateInput(raw: unknown): Record<string, unknown>;
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
  timeoutMs?: number;
  /** Permission classification — defaults to "read" if not specified. */
  access?: ToolAccess;
  /** Whether human confirmation is required — defaults to "none". */
  confirmation?: ToolConfirmation;
  /** Whether the tool is idempotent — defaults to "idempotent". */
  idempotency?: ToolIdempotency;
  /** Tags for grouping/categorization. */
  tags?: string[];
};

// ── Tool activity labels ────────────────────────────────
// Human-readable, activity-suggestive labels for the live UI. The internal
// tool name stays inside the loop/transcript; only these labels surface to
// the learner. The status phrase feeds the "Checking your recent
// performance…" style line while a tool is running.

export const TOOL_ACTIVITY_LABELS: Record<string, { labelBn: string; status: string }> = {
  get_my_profile: { labelBn: "প্রোফাইল", status: "আপনার প্রোফাইল দেখছি…" },
  get_my_goals: { labelBn: "লক্ষ্য", status: "আপনার লক্ষ্য দেখছি…" },
  get_my_mastery: { labelBn: "দক্ষতা", status: "আপনার দক্ষতা বিশ্লেষণ করছি…" },
  get_recent_activity: { labelBn: "কার্যক্রম", status: "সাম্প্রতিক কার্যক্রম দেখছি…" },
  get_question_history: { labelBn: "প্রশ্ন ইতিহাস", status: "প্রশ্ন ইতিহাস দেখছি…" },
  get_wrong_answers: { labelBn: "ভুল উত্তর", status: "ভুল উত্তরগুলো দেখছি…" },
  search_questions: { labelBn: "প্রশ্ন খোঁজা", status: "প্রশ্ন খুঁজছি…" },
  get_question: { labelBn: "প্রশ্ন", status: "প্রশ্নটি দেখছি…" },
  search_syllabus: { labelBn: "সিলেবাস", status: "সিলেবাস খুঁজছি…" },
  get_topic: { labelBn: "টপিক", status: "টপিকের বিস্তারিত দেখছি…" },
  get_exam_weightage: { labelBn: "পরীক্ষার কাঠামো", status: "পরীক্ষার কাঠামো দেখছি…" },
  calculate_readiness: { labelBn: "প্রস্তুতি", status: "পড়াশোনার প্রস্তুতি হিসাব করছি…" },
  recommend_next_action: { labelBn: "পরের ধাপ", status: "পরের সেরা ধাপটি ভাবছি…" },
  search_current_affairs: { labelBn: "কারেন্ট অ্যাফেয়ার্স", status: "সাম্প্রতিক ঘটনা খুঁজছি…" },
  create_practice_session: { labelBn: "প্র্যাকটিস", status: "প্র্যাকটিস সেশন তৈরি করছি…" },
  create_mock_exam: { labelBn: "মক পরীক্ষা", status: "মক পরীক্ষা তৈরি করছি…" },
  analyze_my_mistakes: { labelBn: "ভুল বিশ্লেষণ", status: "আপনার ভুলের প্যাটার্ন বিশ্লেষণ করছি…" },
  create_study_task: { labelBn: "প্ল্যান আপডেট", status: "আপনার স্টাডি প্ল্যানে কাজ যোগ করছি…" },
};

/** Resolve a friendly label + status phrase for a tool name. */
export function toolActivity(name: string): { labelBn: string; status: string } {
  return TOOL_ACTIVITY_LABELS[name] ?? { labelBn: "ডেটা", status: "আপনার ডেটা দেখছি…" };
}

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
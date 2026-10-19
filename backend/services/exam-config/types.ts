// backend/services/exam-config/types.ts — canonical exam configuration model.
//
// One authoritative, versioned description of each exam ecosystem's official
// paper: subjects, marks, hierarchical topics, official suballocations,
// configurable allocation weights, and scoring policy.
//
// Shared by backend services AND the dashboard (served through /api/exam/config),
// never duplicated in components. Pure data + types — no DB, no `server-only`
// side effects, so both the registry and the allocation engine stay unit-testable.
//
// Provenance discipline (AGENTS.md + master spec §3/§7):
//   • `marks` is only ever set when an OFFICIAL figure was supplied/verified.
//   • Anything the syllabus does not specify is left undefined and labelled
//     `inferred` — never fabricated, never presented as official.

export type ExamEcosystemCode = "BCS" | "BANGLADESH_BANK";

/** Which exam surface is asking for a paper. Behavioural policy differs. */
export type ExamMode = "practice" | "mock" | "real";

/**
 * How a number was arrived at. Kept separate from the value so the UI and the
 * API can label official vs configurable vs inferred allocations without
 * guessing.
 */
export type AllocationSource =
  /** Supplied/verified official figure for the syllabus. */
  | "official"
  /** Administrator-configured quota or weight. */
  | "configured"
  /** Neutral fallback derived from eligible inventory — never official. */
  | "inferred";

/** Confidence in the configuration's provenance. Mirrors Prisma `Provenance`. */
export type ConfigProvenance = "OFFICIAL" | "CURATED" | "UNKNOWN";

export type ReviewStatus = "draft" | "reviewed" | "approved";

/** Marking policy. `marksPerCorrect`/`penaltyPerWrong` are the authoritative
 * server-side numbers; the client must never supply them. */
export type ScoringPolicy = {
  marksPerQuestion: number;
  penaltyPerWrong: number;
  marksForUnanswered: number;
};

/**
 * A node in the configured topic hierarchy. `paths` are ABSOLUTE database path
 * prefixes (as stored on `Topic.path` / `Question.path`, including the subject
 * root segment). A question belongs to the node when its path equals a prefix
 * or starts with `prefix + "/"`.
 *
 * A node may carry several prefixes (e.g. an official grouping that combines
 * two taxonomy branches). `children` refines allocation below the node.
 */
export type TopicNode = {
  /** Stable, human-readable id within the exam config (e.g. "international.security"). */
  id: string;
  nameBn: string;
  nameEn?: string;
  /** Absolute DB path prefixes this node covers. Empty for pure grouping nodes. */
  paths: string[];
  /** Official marks for this node, when supplied. Undefined = not official. */
  marks?: number;
  allocationSource: AllocationSource;
  /** Configurable soft weight (relative). Ignored when official marks exist. */
  weight?: number;
  /** Hard minimum questions for this node (mandatory coverage floor). */
  minQuota?: number;
  /** Hard maximum questions for this node. */
  maxQuota?: number;
  /** True when the node MUST receive its minQuota in a full paper. */
  mandatory?: boolean;
  children: TopicNode[];
};

export type SubjectNode = {
  /** Stable config id (e.g. "bcs.bangla"). */
  id: string;
  nameBn: string;
  nameEn: string;
  /** Official subject marks (questions, at 1 mark/question). */
  marks: number;
  allocationSource: AllocationSource;
  /** Root path segment that binds this config subject to a DB `Subject` row. */
  rootSegment: string;
  /** Optional DB nameBn exact match — the primary binding signal. */
  matchNameBn?: string;
  children: TopicNode[];
};

export type ExamConfig = {
  examCode: ExamEcosystemCode;
  /** Integer config version. Bumped whenever marks/topics/scoring change. */
  version: number;
  label: string;
  labelBn: string;
  /** ISO date the configuration became effective, when known. */
  effectiveFrom?: string;
  /** ISO date after which the configuration is superseded. Null = current. */
  effectiveTo?: string | null;
  provenance: ConfigProvenance;
  reviewStatus: ReviewStatus;
  scoring: ScoringPolicy;
  /** Sum of subject marks (questions at 1 mark each). */
  totalMarks: number;
  /** Configured paper length in questions. Equals totalMarks for both exams. */
  totalQuestions: number;
  /** Suggested/known duration in minutes, when known. */
  durationMin?: number;
  subjects: SubjectNode[];
  /** Human-readable notes: reconciliation decisions, unsourced allocations, etc. */
  notes: string[];
};

// ── Validation ─────────────────────────────────────────────

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Config path, e.g. "bcs.international" or "bcs.international.security". */
  path?: string;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

// ── Allocation scope (materialised from config + selection + inventory) ──

export type ScopeNode = {
  id: string;
  nameBn: string;
  nameEn?: string;
  marks?: number;
  allocationSource: AllocationSource;
  weight?: number;
  minQuota?: number;
  maxQuota?: number;
  mandatory?: boolean;
  /** Eligible questions available for this node in the current scope. */
  capacity: number;
  children: ScopeNode[];
};

export type ScopeSubject = {
  id: string;
  nameBn: string;
  nameEn: string;
  marks: number;
  allocationSource: AllocationSource;
  capacity: number;
  children: ScopeNode[];
};

export type ScopeSelection = {
  /** When omitted, the whole configured exam is selected. */
  subjects?: Array<{ subjectId: string; topics?: string[] }>;
  /** Total questions requested (custom papers). Defaults to config.totalQuestions. */
  requested?: number;
  /** Explicit per-subject question counts (custom papers). */
  perSubject?: Record<string, number>;
};

// ── Allocation results ─────────────────────────────────────

export type AllocationOutcome =
  /** Every hard constraint satisfied. */
  | "feasible"
  /** Feasible after permitted redistribution inside the selection scope. */
  | "redistributed"
  /** Custom paper feasible with disclosed deviations (practice policy only). */
  | "deviations"
  /** A full exam could not satisfy mandatory quotas/inventory. */
  | "infeasible"
  /** The configuration or the request itself is invalid. */
  | "invalid";

export type AllocationDiagnostic = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  subjectId?: string;
  topicId?: string;
  requested?: number;
  achievable?: number;
  deficit?: number;
};

export type AllocatedTopic = {
  id: string;
  nameBn: string;
  allocated: number;
  capacity: number;
  source: AllocationSource;
  children: AllocatedTopic[];
};

export type AllocatedSubject = {
  id: string;
  nameBn: string;
  nameEn: string;
  requested: number;
  allocated: number;
  capacity: number;
  source: AllocationSource;
  /** True when this subject is part of a mandatory full-paper contract. */
  mandatory: boolean;
  topics: AllocatedTopic[];
};

export type AllocationResult = {
  outcome: AllocationOutcome;
  examCode: ExamEcosystemCode;
  configVersion: number;
  scoring: ScoringPolicy;
  mode: ExamMode;
  requested: number;
  achievable: number;
  subjects: AllocatedSubject[];
  diagnostics: AllocationDiagnostic[];
};

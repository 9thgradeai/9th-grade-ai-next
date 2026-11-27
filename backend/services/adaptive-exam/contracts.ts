// backend/services/adaptive-exam/contracts.ts — pure typed contracts for the
// Adaptive Exam V2.0 domain. No `server-only`, no Prisma, no runtime imports:
// this module is a leaf so neither the orchestrator nor any module can create a
// circular dependency through it.
//
// Design rules encoded here (not merely documented):
//   • A candidate-facing paper has NO answer field. `CandidatePaperQuestion`
//     and `PaperSnapshot` cannot express a correct answer at the type level.
//   • Submission commands carry no question ids, marks or correct answers.
//     The server derives all of them from the immutable paper/profile snapshot.
//   • Every derived artifact carries a hash so a later profile/performance
//     change cannot silently rewrite a historical blueprint or result.
//   • Only BCS/BANK ecosystem codes from the existing config registry are
//     reused; post-level profiles are first-class and independently versioned.

import type {
  ExamEcosystemCode,
  ScoringPolicy,
  ValidationIssue,
} from "~backend/services/exam-config/types";

// ─────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────

export type IsoTimestamp = string;
export type EntityId = string;
export type LanguageCode = "bn" | "en";
export type DifficultyBand = "EASY" | "MEDIUM" | "HARD";
export type OptionKey = "A" | "B" | "C" | "D";
/** Exactly four options — a 3-option or 5-option question cannot be typed. */
export type QuestionOptions = Readonly<Record<OptionKey, string>>;

/** Extensible exam families; "OTHERS" covers catalog-registered organisations. */
export type ExamFamily = "BCS" | "BANK" | "OTHERS";
export type BlueprintMode =
  | "HISTORICAL_PATTERN"
  | "BALANCED"
  | "HIGH_YIELD"
  | "ADAPTIVE"
  | "WEAKNESS_FOCUSED"
  | "FULL_EXAM_SIMULATION";

export type QuestionSourceType =
  | "PYQ"
  | "PYQ_DERIVED"
  | "ORIGINAL"
  | "CURRENT_AFFAIRS"
  | "DIAGNOSTIC";

export type ExamLifecycleStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTING"
  | "COMPLETED"
  | "EXPIRED"
  | "ABANDONED"
  | "FAILED";

export type ValidationOutcome =
  | "PASS"
  | "PASS_WITH_WARNING"
  | "REPAIR_REQUIRED"
  | "REJECTED";

export type FindingSeverity = "info" | "warning" | "error" | "critical";

// ─────────────────────────────────────────────────────────────
// Error taxonomy
// ─────────────────────────────────────────────────────────────

/** Stable, client-safe codes. HTTP status mapping lives in `errors.ts`. */
export type AdaptiveExamErrorCode =
  | "ADAPTIVE_UNAUTHORIZED"
  | "ADAPTIVE_FORBIDDEN"
  | "ADAPTIVE_OWNERSHIP_DENIED"
  | "ADAPTIVE_ANSWER_KEY_RELEASE_DENIED"
  | "ADAPTIVE_PROFILE_NOT_APPROVED"
  | "ADAPTIVE_PROFILE_NOT_FOUND"
  | "ADAPTIVE_PAPER_NOT_FOUND"
  | "ADAPTIVE_BLUEPRINT_NOT_FOUND"
  | "ADAPTIVE_SESSION_NOT_FOUND"
  | "ADAPTIVE_SUBMISSION_NOT_FOUND"
  | "ADAPTIVE_SESSION_EXPIRED"
  | "ADAPTIVE_PROFILE_INVALID"
  | "ADAPTIVE_OVERRIDE_NOT_ALLOWED"
  | "ADAPTIVE_SUBMISSION_INVALID"
  | "ADAPTIVE_HISTORICAL_SCOPE_INVALID"
  | "ADAPTIVE_IMPORT_INVALID"
  | "ADAPTIVE_INSUFFICIENT_DATA"
  | "ADAPTIVE_QUESTION_INVALID"
  | "ADAPTIVE_PAPER_INVALID"
  | "ADAPTIVE_BLUEPRINT_INVALID"
  | "ADAPTIVE_SESSION_INVALID_STATE"
  | "ADAPTIVE_SESSION_CONFLICT"
  | "ADAPTIVE_IDEMPOTENCY_CONFLICT"
  | "ADAPTIVE_IMPORT_CONFLICT"
  | "ADAPTIVE_RATE_LIMITED"
  | "ADAPTIVE_GENERATION_FAILED"
  | "ADAPTIVE_GENERATION_TIMEOUT"
  | "ADAPTIVE_DEPENDENCY_UNAVAILABLE"
  | "ADAPTIVE_ANSWER_KEY_MISSING"
  | "ADAPTIVE_ANSWER_KEY_CORRUPT"
  | "ADAPTIVE_PERSISTENCE_ERROR"
  | "ADAPTIVE_AUDIT_ERROR"
  | "ADAPTIVE_VALIDATION_FAILED"
  | "ADAPTIVE_INTERNAL_ERROR";

/** Pipeline stage carried with every adaptive error for structured logging. */
export type AdaptiveExamStage =
  | "configuration"
  | "historical"
  | "candidate"
  | "blueprint"
  | "selection"
  | "generation"
  | "validation"
  | "paper"
  | "session"
  | "submission"
  | "scoring"
  | "reporting"
  | "audit"
  | "integration";

// ─────────────────────────────────────────────────────────────
// Profile registry
// ─────────────────────────────────────────────────────────────

/**
 * Profile identifiers are open strings: catalog rows (and future "Others"
 * organisations) can introduce new profiles without a TypeScript release.
 * Known IDs are exported as constants for type-safe internal call sites.
 */
export type AdaptiveExamProfileId = string;

export const KNOWN_ADAPTIVE_PROFILE_IDS = Object.freeze({
  BCS_GENERAL: "BCS_PRELIMINARY",
  BCS_SPECIAL: "BCS_SPECIAL",
  BB_SENIOR_OFFICER_GENERAL: "BB_SENIOR_OFFICER_GENERAL",
  BB_ASSISTANT_DIRECTOR_GENERAL: "BB_ASSISTANT_DIRECTOR_GENERAL",
  BB_OFFICER_GENERAL: "BB_OFFICER_GENERAL",
  BB_OFFICER_IT: "BB_OFFICER_IT",
  BB_OFFICER_CASH: "BB_OFFICER_CASH",
  BB_ASSISTANT_MANAGER: "BB_ASSISTANT_MANAGER",
} as const);

export type ExamCatalogNode = {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  active: boolean;
};

export type ExamCatalog = {
  families: Array<"BCS" | "BANK" | "OTHERS">;
  organizations: Array<ExamCatalogNode & { family: "BCS" | "BANK" | "OTHERS" }>;
  posts: Array<ExamCatalogNode & { organizationId: string }>;
  types: Array<ExamCatalogNode & { postId: string; profileId?: string }>;
};

export type ProfileSummary = {
  id: AdaptiveExamProfileId;
  version: number;
  family: ExamFamily;
  organization: string;
  recruitmentPost: string;
  stage: string;
  labelBn: string;
  labelEn: string;
  totalQuestions: number;
  totalMarks: number;
  durationMin: number;
  verificationStatus: ProfileVerificationStatus;
  provisional: boolean;
  historicalDataEligible: boolean;
  subjects: Array<{ subjectId: string; nameBn: string; nameEn: string; count: number; language: LanguageCode }>;
};

export type ProfileVerificationStatus =
  | "draft"
  | "reviewed"
  | "approved"
  | "rejected";

export type LanguagePolicyKind =
  | "BANGLA_DEFAULT"
  | "ENGLISH_DEFAULT"
  | "BILINGUAL"
  | "SUBJECT_OVERRIDE";

export type ProfileOverrideKey =
  | "questionCount"
  | "durationMin"
  | "difficulty"
  | "language"
  | "sourceMix"
  | "topics";

export type TopicAllocationSpec = {
  topicId: string;
  /** Absolute DB taxonomy prefixes, as used by exam-config TopicNode.paths. */
  paths: string[];
  count?: number;
  weight?: number;
  subtopicPaths?: string[];
};

export type SubjectAllocationSpec = {
  subjectId: string;
  nameBn: string;
  nameEn: string;
  aliases: string[];
  count: number;
  language: LanguageCode;
  topics: TopicAllocationSpec[];
};

export type ProfileSource = {
  kind: "official" | "user-provided" | "curated";
  reference?: string;
  verifiedAt?: IsoTimestamp;
  note?: string;
};

export type ProfileRevision = {
  version: number;
  changedAt: IsoTimestamp;
  changedBy: string;
  summary: string;
};

export type ExamProfile = {
  id: AdaptiveExamProfileId;
  version: number;
  family: ExamFamily;
  /** Binds to the existing ecosystem row/config without conflating posts. */
  ecosystemCode: ExamEcosystemCode;
  organization: string;
  recruitmentPost: string;
  stage: string;
  labelBn: string;
  labelEn: string;
  subjects: SubjectAllocationSpec[];
  totalQuestions: number;
  totalMarks: number;
  durationMin: number;
  scoring: ScoringPolicy;
  /** Percentages; must sum to 100. */
  difficultyDistribution: Record<DifficultyBand, number>;
  languagePolicy: LanguagePolicyKind;
  historicalDataEligible: boolean;
  pyqPolicy: {
    allowSourceClaimedAnswers: boolean;
    allowUnverifiedAnswers: boolean;
    minVerifiedShare: number;
  };
  allowedOverrides: ProfileOverrideKey[];
  source: ProfileSource;
  verificationStatus: ProfileVerificationStatus;
  /** Provisional profiles use project-supplied baselines, not verified official notices. */
  provisional: boolean;
  effectiveFrom?: IsoTimestamp;
  effectiveTo?: IsoTimestamp;
  revisionHistory: ProfileRevision[];
  notes: string[];
};

export type AdaptiveValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

// ─────────────────────────────────────────────────────────────
// Historical question domain
// ─────────────────────────────────────────────────────────────

export type IngestionStage =
  | "SOURCE_DISCOVERY"
  | "EXTRACTION"
  | "NORMALIZATION"
  | "PARSING"
  | "CLASSIFICATION"
  | "ANSWER_EXTRACTION"
  | "VERIFICATION"
  | "DEDUPLICATION"
  | "IMPORT_PREVIEW"
  | "APPROVAL"
  | "DATABASE_IMPORT"
  | "AUDIT_REPORT";

export type AnswerVerificationStatus =
  | "UNVERIFIED"
  | "SOURCE_CLAIMED"
  | "CROSS_CHECKED"
  | "HUMAN_VERIFIED"
  | "DISPUTED";

/** Actual metered usage reported by the provider, plus wall-clock latency. */
export type GenerationUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

export type QuestionProvenance = {
  sourceType: QuestionSourceType;
  sourceFile?: string;
  reference?: string;
  page?: number;
  sourceUrl?: string;
  publishedAt?: IsoTimestamp;
  retrievedAt?: IsoTimestamp;
  importBatchId?: EntityId;
  generation?: {
    provider: string;
    model: string;
    promptVersion: string;
    repairAttempts: number;
    /** True when the labelled mock provider produced the item. */
    mock?: boolean;
    /** Real provider usage for this batch; never a fabricated estimate. */
    usage?: GenerationUsage;
  };
  /** Preserves authoritative book Unicode from the live bank. */
  rawMath?: boolean;
};

export type HistoricalQuestionRecord = {
  id: EntityId;
  family: ExamFamily;
  organization: string;
  recruitmentPost: string;
  examinationName: string;
  examYear?: number;
  examDate?: IsoTimestamp;
  stage: string;
  paperSet?: string;
  subjectId: string;
  subjectName: string;
  topicPath: string;
  subtopicPath?: string;
  originalLanguage: LanguageCode;
  questionText: string;
  options: QuestionOptions;
  /** Claim by the source — never overwritten silently. */
  claimedAnswer?: OptionKey;
  /** Independent verification result, kept distinct from the claim. */
  verifiedAnswer?: OptionKey;
  explanation?: string;
  verification: AnswerVerificationStatus;
  explanationOrigin: "historical" | "ai-generated" | "human-reviewed" | "none";
  provenance: QuestionProvenance;
  classification: {
    status: "classified" | "unclassified" | "exception";
    difficulty?: DifficultyBand;
    difficultyConfidence?: number;
  };
  duplicateGroupId?: EntityId;
  originalSourceText: string;
  normalizedText: string;
  eligibleForPyq: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export type ImportIssue = {
  recordRef: string;
  stage: IngestionStage;
  reason: string;
  severity: FindingSeverity;
  preservedRef: string;
};

export type ImportReport = {
  batchId: EntityId;
  startedAt: IsoTimestamp;
  finishedAt: IsoTimestamp;
  totals: {
    extracted: number;
    parsed: number;
    imported: number;
    skipped: number;
    duplicate: number;
    unverified: number;
    failed: number;
  };
  exceptions: ImportIssue[];
  rollback: {
    possibleUntil?: IsoTimestamp;
    procedure: string;
  };
};

export type HistoricalAnalyticsFilter = {
  family?: ExamFamily;
  organization?: string;
  recruitmentPost?: string;
  profileId?: AdaptiveExamProfileId;
  yearFrom?: number;
  yearTo?: number;
  subjectId?: string;
  topicPath?: string;
  subtopicPath?: string;
  questionType?: "single" | "multiple" | "statement" | "scenario";
  difficulty?: DifficultyBand;
  verification?: AnswerVerificationStatus;
};

export type TopicFrequency = {
  topicPath: string;
  count: number;
  distinctYears: number;
  /** distincYears / comparableYears × 100. Not a future-appearance probability. */
  recurrenceRate: number;
  recentFrequency: number;
  olderFrequency: number;
  /** Recency-weighted count for the configured decay parameter. */
  weightedFrequency: number;
};

export type HistoricalAnalyticsReport = {
  filter: HistoricalAnalyticsFilter;
  generatedAt: IsoTimestamp;
  decayParameter: number;
  coverage: {
    sampleSize: number;
    yearsCovered: number;
    comparableYears: number;
    verifiedShare: number;
    insufficientEvidence: boolean;
    gaps: string[];
  };
  yearWise: Array<{ year: number; count: number }>;
  subjectWise: Array<{ subjectId: string; count: number }>;
  topics: TopicFrequency[];
  questionTypeDistribution: Record<string, number>;
  difficultyProfile: Record<DifficultyBand, number>;
  duplicates: { exact: number; near: number };
  quality: { verified: number; disputed: number; malformed: number };
};

// ─────────────────────────────────────────────────────────────
// Candidate performance domain
// ─────────────────────────────────────────────────────────────

export type CandidateIndicator =
  | "WEAK_CONCEPT"
  | "CARELESS_MISTAKE"
  | "SLOW_SOLVER"
  | "GUESSING"
  | "REPEATED_MISCONCEPTION"
  | "INSUFFICIENT_PRACTICE"
  | "STRONG_TOPIC"
  | "INSUFFICIENT_EVIDENCE";

export type TopicEvidence = {
  subjectId: string;
  topicPath: string;
  attempts: number;
  correct: number;
  wrong: number;
  unanswered: number;
  avgTimeSec?: number;
  recentAttempts: number;
  repeatedMistakes: number;
  /** 0–100; low values must never be read as established weakness. */
  confidence: number;
  indicator: CandidateIndicator;
  sufficientEvidence: boolean;
};

export type CandidateSnapshot = {
  userId: string;
  profileId: AdaptiveExamProfileId;
  generatedAt: IsoTimestamp;
  window: { from: IsoTimestamp; to: IsoTimestamp };
  topics: TopicEvidence[];
  overall: { attempts: number; accuracy: number; confidence: number };
  warnings: string[];
  hash: string;
  attemptedQuestionIds?: readonly EntityId[];
};

// ─────────────────────────────────────────────────────────────
// Blueprint, paper and answer key
// ─────────────────────────────────────────────────────────────

export type DataSufficiency = {
  sufficient: boolean;
  reasons: string[];
  coverage: {
    historicalYears: number;
    verifiedShare: number;
    topicCoverage: number;
  };
};

export type TopicBlueprintAllocation = {
  topicId: string;
  paths: string[];
  /** Leaf paths underneath this topic, preserved for topic→subtopic selection. */
  subtopicPaths?: string[];
  count: number;
  difficulty: Record<DifficultyBand, number>;
  sources: Record<QuestionSourceType, number>;
  language: LanguageCode;
};

export type SubjectBlueprintAllocation = {
  subjectId: string;
  count: number;
  language: LanguageCode;
  topics: TopicBlueprintAllocation[];
};

export type ExamBlueprint = {
  id: EntityId;
  version: number;
  hash: string;
  createdAt: IsoTimestamp;
  profileId: AdaptiveExamProfileId;
  profileVersion: number;
  family: ExamFamily;
  mode: BlueprintMode;
  requestedQuestionCount: number;
  totalQuestionCount: number;
  totalMarks: number;
  durationSec: number;
  scoring: ScoringPolicy;
  languageBySubject: Record<string, LanguageCode>;
  allocations: SubjectBlueprintAllocation[];
  difficultyAllocation: Record<DifficultyBand, number>;
  sourceAllocation: Record<QuestionSourceType, number>;
  historicalYearRange?: { from: number; to: number };
  candidateAdaptation: {
    enabled: boolean;
    weights: Record<string, number>;
    snapshotHash?: string;
  };
  duplicateExclusions: EntityId[];
  dataSufficiency: DataSufficiency;
  warnings: string[];
  status: "draft" | "committed" | "superseded";
};

export type BlueprintDraft = Omit<ExamBlueprint, "id" | "status" | "hash" | "createdAt">;

/** Candidate-safe question type: no correct answer, no explanation. */
export type CandidatePaperQuestion = {
  position: number;
  questionId?: EntityId;
  sourceType: QuestionSourceType;
  subjectId: string;
  subjectName: string;
  topicPath: string;
  subtopicPath?: string;
  language: LanguageCode;
  difficulty: DifficultyBand;
  questionText: string;
  options: QuestionOptions;
  provenance: QuestionProvenance;
  marks: number;
};

export type PaperSnapshot = {
  id: EntityId;
  version: number;
  blueprintId: EntityId;
  blueprintHash: string;
  createdAt: IsoTimestamp;
  questions: CandidatePaperQuestion[];
  contentHash: string;
  validation: ValidationOutcome;
  /** No answer key here by design — see SecureAnswerKey / AnswerKeyStore. */
};

export type SecureAnswerKeyEntry = {
  position: number;
  correctOption: OptionKey;
  explanation: string;
};

export type SecureAnswerKey = {
  paperId: EntityId;
  contentHash: string;
  entries: SecureAnswerKeyEntry[];
  createdAt: IsoTimestamp;
};

export type ValidationFinding = {
  rule: string;
  severity: FindingSeverity;
  message: string;
  path?: string;
  questionId?: EntityId;
  position?: number;
  evidence?: Record<string, unknown>;
};

export type ValidationReport = {
  target: { kind: "question" | "paper"; id: EntityId };
  outcome: ValidationOutcome;
  findings: ValidationFinding[];
  checkedAt: IsoTimestamp;
  validatorVersion: string;
};

// ─────────────────────────────────────────────────────────────
// Session, scoring, recommendations, audit
// ─────────────────────────────────────────────────────────────

export type ExamSession = {
  attemptId: EntityId;
  userId: string;
  paperId: EntityId;
  blueprintId: EntityId;
  profileId: AdaptiveExamProfileId;
  profileVersion: number;
  status: ExamLifecycleStatus;
  startsAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  submittedAt?: IsoTimestamp;
  answers: Record<number, OptionKey>;
  flags: number[];
  lastSavedAt?: IsoTimestamp;
  version: number;
  /** Client-supplied key, accepted once per (userId, idempotencyKey). */
  idempotencyKey: string;
};

export type PerformanceSlice = {
  subjectId?: string;
  topicPath?: string;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  accuracy: number;
};

export type ScoreReport = {
  attemptId: EntityId;
  paperId: EntityId;
  profileId: AdaptiveExamProfileId;
  profileVersion: number;
  scoring: ScoringPolicy;
  correct: number;
  incorrect: number;
  unanswered: number;
  total: number;
  obtainedMarks: number;
  maxMarks: number;
  accuracy: number;
  percentage: number;
  subjectPerformance: PerformanceSlice[];
  topicPerformance: PerformanceSlice[];
  difficultyPerformance: Record<DifficultyBand, PerformanceSlice>;
  sourcePerformance: Record<QuestionSourceType, PerformanceSlice>;
  timeMetrics: { elapsedSec: number; avgSecPerQuestion?: number };
  immutable: true;
};

export type PerformanceReport = {
  attemptId: EntityId;
  score: ScoreReport;
  indicators: CandidateIndicator[];
  revisionPriorities: Array<{
    subjectId: string;
    topicPath: string;
    priority: number;
    reason: string;
    confidence: number;
  }>;
  timeEfficiency: { slowTopicPaths: string[]; confidence: number };
  historicalVsGenerated: {
    historicalAccuracy: number;
    generatedAccuracy: number;
    sampleSize: number;
  };
  limitations: string[];
  candidateSnapshotHash: string;
  generatedAt: IsoTimestamp;
};

export type AdaptiveAuditEventName =
  | "PROFILE_RESOLVED"
  | "PROFILE_REVISION_ADDED"
  | "HISTORICAL_IMPORT_APPROVED"
  | "HISTORICAL_IMPORT_ROLLED_BACK"
  | "ANALYTICS_COMPUTED"
  | "CANDIDATE_SNAPSHOT_CREATED"
  | "BLUEPRINT_DRAFTED"
  | "BLUEPRINT_COMMITTED"
  | "QUESTIONS_SELECTED"
  | "QUESTIONS_GENERATED"
  | "PAPER_VALIDATED"
  | "PAPER_REJECTED"
  | "PAPER_SNAPSHOT_CREATED"
  | "SESSION_STARTED"
  | "SESSION_ANSWER_SAVED"
  | "SESSION_SUBMITTED"
  | "ANSWER_KEY_RELEASED"
  | "SCORE_COMPUTED"
  | "RECOMMENDATIONS_GENERATED";

export type AuditEvent = {
  name: AdaptiveAuditEventName;
  occurredAt: IsoTimestamp;
  requestId: string;
  correlationId?: string;
  actorId?: string;
  entityType: string;
  entityId: EntityId;
  /** Never include answers, correct options, secrets or raw PII. */
  metadata: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────
// Commands (note the deliberate absence of client-trusted rules)
// ─────────────────────────────────────────────────────────────

export type PrepareAdaptiveExamCommand = {
  userId: string;
  family: ExamFamily;
  profileId: AdaptiveExamProfileId;
  profileVersion?: number;
  subjects: string[];
  topics?: string[];
  requestedQuestionCount: number;
  /** Optional: server still validates against profile.allowedOverrides. */
  durationMin?: number;
  mode: BlueprintMode;
  difficulty?: DifficultyBand | "MIXED";
  historicalYearRange?: { from: number; to: number };
  sourceMix?: Partial<Record<QuestionSourceType, number>>;
  adaptationEnabled: boolean;
  languageOverride?: Partial<Record<string, LanguageCode>>;
  idempotencyKey: string;
};

export type PreparedExam = {
  blueprint: ExamBlueprint;
  candidateSnapshotHash?: string;
  estimatedHistoricalCount: number;
  estimatedGeneratedCount: number;
  warnings: string[];
};

/** No durationSec: the server resolves duration from the committed blueprint. */
export type StartAdaptiveExamCommand = {
  userId: string;
  paperId: EntityId;
  blueprintId: EntityId;
  idempotencyKey: string;
};

/** No questionIds, no correct answers, no marks: all derived from the paper. */
export type SubmitAdaptiveExamCommand = {
  userId: string;
  attemptId: EntityId;
  paperId: EntityId;
  answers: Array<{ position: number; option: OptionKey }>;
  durationSec: number;
  idempotencyKey: string;
};

// ─────────────────────────────────────────────────────────────
// Injection ports and execution context
// ─────────────────────────────────────────────────────────────

export interface AdaptiveExamClock {
  now(): IsoTimestamp;
}

export interface AdaptiveExamLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  debug(event: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): AdaptiveExamLogger;
}

export interface AdaptiveExamCache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  invalidate(pattern: string): Promise<void>;
}

export interface AdaptiveExamDb {
  transaction<T>(
    work: (tx: unknown) => Promise<T>,
    options?: { isolation?: "serializable" | "read committed" },
  ): Promise<T>;
}

export type AdaptiveGenerationRequest = {
  profileId: AdaptiveExamProfileId;
  profileVersion: number;
  subjectId: string;
  topicPath?: string;
  subtopicPath?: string;
  language: LanguageCode;
  difficulty: DifficultyBand;
  count: number;
  sourceType: QuestionSourceType;
  instructions: string;
  evidence?: Array<{ url: string; publishedAt?: IsoTimestamp; snippet?: string }>;
  requestId: string;
  /** Server-owned user id for the shared AI usage ledger. */
  userId: string;
};

export type AdaptiveGenerationResult = {
  questions: Array<{
    questionText: string;
    options: QuestionOptions;
    correctOption: OptionKey;
    explanation: string;
    topicPath: string;
    subtopicPath?: string;
    difficulty: DifficultyBand;
    provenance: QuestionProvenance;
  }>;
  provider: string;
  model: string;
  promptVersion: string;
  durationMs: number;
  usage: GenerationUsage;
};

export interface AiGenerationPort {
  generate(request: AdaptiveGenerationRequest): Promise<AdaptiveGenerationResult>;
}

export interface AnswerKeyStore {
  put(paperId: EntityId, key: SecureAnswerKey): Promise<void>;
  /** Internal scoring path only; never exposed through a candidate API. */
  getForScoring(paperId: EntityId): Promise<SecureAnswerKey | null>;
  /** Authorized post-submit/admin access only. */
  releaseForReview(attemptId: EntityId, ctx: AdaptiveExecutionContext): Promise<SecureAnswerKey | null>;
}

export interface LegacyExamPorts {
  resolveEcosystemId(family: ExamFamily): Promise<number>;
  getPaperReadiness(ecosystemCode: ExamEcosystemCode): Promise<unknown>;
  registerAttempt(input: {
    userId: string;
    attemptId: EntityId;
    questionIds: number[];
    durationSec: number;
  }): Promise<void>;
  submitAttempt(
    userId: string,
    input: {
      attemptId: EntityId;
      questionIds: number[];
      durationSec: number;
      answers: Array<{ questionId: number; selected: string }>;
    },
  ): Promise<unknown>;
}

export type AdaptiveExamPorts = {
  clock: AdaptiveExamClock;
  logger: AdaptiveExamLogger;
  cache: AdaptiveExamCache;
  db: AdaptiveExamDb;
  ai: AiGenerationPort;
  answerKeys: AnswerKeyStore;
  legacyExam: LegacyExamPorts;
};

export type AdaptiveExecutionContext = {
  userId: string;
  requestId: string;
  correlationId?: string;
  ports: AdaptiveExamPorts;
  secureAnswerKey?: SecureAnswerKey;
};

// ─────────────────────────────────────────────────────────────
// Module contracts — one interface per logical module
// ─────────────────────────────────────────────────────────────

/** Coordinates CONFIGURATION → … → PERFORMANCE ANALYSIS. */
export interface AdaptiveExamOrchestrator {
  prepare(ctx: AdaptiveExecutionContext, command: PrepareAdaptiveExamCommand): Promise<PreparedExam>;
  generatePaper(ctx: AdaptiveExecutionContext, blueprintId: EntityId): Promise<PaperSnapshot>;
  getPaper(paperId: EntityId): Promise<PaperSnapshot | null>;
  startSession(ctx: AdaptiveExecutionContext, command: StartAdaptiveExamCommand): Promise<ExamSession>;
  getSession(userId: string, attemptId: EntityId): Promise<ExamSession | null>;
  recordAnswer(
    userId: string,
    attemptId: EntityId,
    position: number,
    option: OptionKey,
    expectedVersion?: number,
  ): Promise<ExamSession>;
  setFlag(
    userId: string,
    attemptId: EntityId,
    position: number,
    flagged: boolean,
    expectedVersion?: number,
  ): Promise<ExamSession>;
  submit(ctx: AdaptiveExecutionContext, command: SubmitAdaptiveExamCommand): Promise<ScoreReport>;
  report(ctx: AdaptiveExecutionContext, attemptId: EntityId): Promise<PerformanceReport>;
  releaseAnswerKey(ctx: AdaptiveExecutionContext, attemptId: EntityId): Promise<SecureAnswerKey | null>;
}

export interface ExamProfileRegistry {
  list(family?: ExamFamily): Promise<ExamProfile[]>;
  resolve(id: AdaptiveExamProfileId, version?: number): Promise<ExamProfile | null>;
  validate(profile: ExamProfile): AdaptiveValidationResult;
  /** Official simulation stays disabled unless verificationStatus is approved. */
  officialSimulationEnabled(profile: ExamProfile): boolean;
  addRevision(profile: ExamProfile, next: ExamProfile): Promise<ExamProfile>;
}

export interface HistoricalQuestionRepository {
  findEligible(criteria: HistoricalAnalyticsFilter & {
    profileId?: AdaptiveExamProfileId;
    sourceType?: QuestionSourceType;
    excludeIds?: EntityId[];
    limit?: number;
  }): Promise<HistoricalQuestionRecord[]>;
  count(criteria: HistoricalAnalyticsFilter): Promise<number>;
  getByIds(ids: EntityId[]): Promise<HistoricalQuestionRecord[]>;
  findDuplicateGroup(fingerprint: string): Promise<EntityId | null>;
}

export interface HistoricalDataIngestionService {
  discover(sourceRef: string): Promise<EntityId[]>;
  extract(sourceId: EntityId): Promise<string>;
  normalize(raw: string): Promise<string>;
  parse(text: string): Promise<HistoricalQuestionRecord[]>;
  classify(record: HistoricalQuestionRecord): Promise<HistoricalQuestionRecord>;
  extractAnswer(record: HistoricalQuestionRecord): Promise<OptionKey | null>;
  verify(record: HistoricalQuestionRecord): Promise<AnswerVerificationStatus>;
  dedupe(records: HistoricalQuestionRecord[]): Promise<HistoricalQuestionRecord[]>;
  preview(batchId: EntityId): Promise<ImportReport>;
  approve(batchId: EntityId, ctx: AdaptiveExecutionContext): Promise<void>;
  importBatch(batchId: EntityId, ctx: AdaptiveExecutionContext): Promise<ImportReport>;
  rollback(batchId: EntityId, ctx: AdaptiveExecutionContext): Promise<ImportReport>;
}

export interface HistoricalAnalyticsService {
  analyze(filter: HistoricalAnalyticsFilter): Promise<HistoricalAnalyticsReport>;
  invalidate(reason: string): Promise<void>;
}

export interface CandidatePerformanceService {
  snapshot(userId: string, profileId: AdaptiveExamProfileId): Promise<CandidateSnapshot>;
  indicators(userId: string, topicPaths: string[]): Promise<TopicEvidence[]>;
}

export interface AdaptiveBlueprintService {
  build(
    command: PrepareAdaptiveExamCommand,
    profile: ExamProfile,
    candidate: CandidateSnapshot,
    historical: HistoricalAnalyticsReport,
  ): Promise<BlueprintDraft>;
  validate(draft: BlueprintDraft): AdaptiveValidationResult;
  /** Persists an immutable, hashed, versioned snapshot. */
  commit(draft: BlueprintDraft, ctx: AdaptiveExecutionContext): Promise<ExamBlueprint>;
  /** Retrieves a committed blueprint by ID. */
  getById(blueprintId: EntityId): Promise<ExamBlueprint | null>;
}

export type SelectionSpec = {
  blueprint: ExamBlueprint;
  candidate: CandidateSnapshot;
  excludeIds: EntityId[];
};

export type SelectedQuestion = {
  position: number;
  sourceType: QuestionSourceType;
  subjectId: string;
  topicPath: string;
  subtopicPath?: string;
  language: LanguageCode;
  difficulty: DifficultyBand;
  record?: HistoricalQuestionRecord;
};

export interface QuestionSelectionService {
  select(spec: SelectionSpec): Promise<SelectedQuestion[]>;
  /** Transparent, non-fabricated shortage description. */
  explainShortage(spec: SelectionSpec): Promise<string[]>;
}

export interface SubjectSpecialistService {
  instructions(
    subjectId: string,
    language: LanguageCode,
    difficulty: DifficultyBand,
    profileId: AdaptiveExamProfileId,
  ): string;
  supportedSubjects(profileId: AdaptiveExamProfileId): string[];
}

export interface QuestionGenerationService {
  generate(
    selected: SelectedQuestion[],
    profile: ExamProfile,
    specialists: SubjectSpecialistService,
    ctx: AdaptiveExecutionContext,
  ): Promise<CandidatePaperQuestion[]>;
  generateWithKeys(
    selected: SelectedQuestion[],
    profile: ExamProfile,
    specialists: SubjectSpecialistService,
    ctx: AdaptiveExecutionContext,
  ): Promise<{
    candidateQuestions: CandidatePaperQuestion[];
    answerKeyEntries: SecureAnswerKeyEntry[];
    telemetry: GenerationTelemetry[];
  }>;
  /** Bounded; never an unbounded regeneration loop. */
  maxRepairAttempts(): number;
}

export interface QuestionValidationService {
  validateQuestion(
    question: CandidatePaperQuestion,
    blueprint: ExamBlueprint,
  ): Promise<ValidationReport>;
  validatePaper(
    questions: CandidatePaperQuestion[],
    blueprint: ExamBlueprint,
  ): Promise<ValidationReport>;
  repair(
    question: CandidatePaperQuestion,
    report: ValidationReport,
    attempt: number,
  ): Promise<CandidatePaperQuestion | null>;
}

export interface ExamSessionService {
  create(ctx: AdaptiveExecutionContext, command: StartAdaptiveExamCommand): Promise<ExamSession>;
  get(userId: string, attemptId: EntityId): Promise<ExamSession | null>;
  recordAnswer(
    userId: string,
    attemptId: EntityId,
    position: number,
    option: OptionKey,
    expectedVersion?: number,
  ): Promise<ExamSession>;
  setFlag(
    userId: string,
    attemptId: EntityId,
    position: number,
    flagged: boolean,
    expectedVersion?: number,
  ): Promise<ExamSession>;
  expire(attemptId: EntityId): Promise<ExamSession>;
  submit(ctx: AdaptiveExecutionContext, command: SubmitAdaptiveExamCommand): Promise<ExamSession>;
}

export interface ExamScoringService {
  score(paper: PaperSnapshot, key: SecureAnswerKey, profile: ExamProfile, answers: SubmitAdaptiveExamCommand): ScoreReport;
}

export interface AdaptiveRecommendationService {
  buildReport(score: ScoreReport, snapshot: CandidateSnapshot, paper: PaperSnapshot): PerformanceReport;
  /** Writes back through existing mastery/LearningEvent services only. */
  applyToCandidateProfile(ctx: AdaptiveExecutionContext, report: PerformanceReport): Promise<void>;
  nextBlueprintWeights(report: PerformanceReport): Record<string, number>;
}

export interface ExamAuditService {
  record(event: AuditEvent): Promise<void>;
  query(filter: { entityId?: EntityId; name?: AdaptiveAuditEventName; from?: IsoTimestamp }): Promise<AuditEvent[]>;
}

/** Write-once candidate-safe paper storage. A second write is a conflict. */
export interface PaperStore {
  put(paper: PaperSnapshot): Promise<PaperSnapshot>;
  get(paperId: EntityId): Promise<PaperSnapshot | null>;
}

/** Write-once immutable report storage; one performance report per attempt. */
export interface ScoreReportStore {
  put(input: {
    score: ScoreReport;
    report: PerformanceReport;
    candidateSnapshotHash?: string;
  }): Promise<void>;
  getScore(attemptId: EntityId): Promise<ScoreReport | null>;
  getReport(attemptId: EntityId): Promise<PerformanceReport | null>;
}

// ─────────────────────────────────────────────────────────────
// Global integrity, publication and durable generation (Phase 1/3/6)
// ─────────────────────────────────────────────────────────────

export type DuplicateLevel = "EXACT" | "NEAR" | "TEMPLATE" | "CONCEPT" | "REVISION" | "NONE";

export type DuplicateDecision = {
  level: DuplicateLevel;
  accepted: boolean;
  reason: string;
  matchedExposureId?: EntityId;
};

export type QuestionFingerprint = {
  fingerprint: string;
  exactHash: string;
  nearHash: string;
  templateHash: string;
};

export interface QuestionIdentityService {
  fingerprint(questionText: string, options: QuestionOptions): QuestionFingerprint;
}

export type QuestionExposure = QuestionFingerprint & {
  id: EntityId;
  profileId: AdaptiveExamProfileId;
  subjectId: string;
  topicPath: string;
  source: "PYQ" | "IMPORTED_BANK" | "GENERATED";
  visibility: "PUBLIC" | "PRIVATE" | "UPCOMING";
  paperId?: EntityId;
  ownerId?: string;
  firstSeenAt: IsoTimestamp;
};

/** Internal-only duplicate index; exposure rows never contain question text. */
export interface QuestionExposureStore {
  findByExactHash(exactHash: string): Promise<QuestionExposure | null>;
  findByNearHash(nearHash: string): Promise<QuestionExposure | null>;
  findByTemplateHash(templateHash: string): Promise<QuestionExposure | null>;
  countConcept(subjectId: string, topicPath: string, since?: IsoTimestamp): Promise<number>;
  insert(exposure: QuestionExposure): Promise<QuestionExposure>;
}

export interface GlobalDuplicateService {
  check(input: {
    questionText: string;
    options: QuestionOptions;
    profileId: AdaptiveExamProfileId;
    subjectId: string;
    topicPath: string;
    /** Revision mode deliberately permits authentic PYQ repetition. */
    revisionMode: boolean;
    currentPaperFingerprints: ReadonlySet<string>;
    /** Coarse concept key for the per-paper overlap cap. */
    conceptKey?: string;
    /** Multiset of concepts already used in the current paper (repeats count). */
    currentPaperConcepts?: ReadonlyArray<string>;
    maxConceptOverlapPerTopic?: number;
  }): Promise<DuplicateDecision>;
  record(input: {
    fingerprint: QuestionFingerprint;
    profileId: AdaptiveExamProfileId;
    subjectId: string;
    topicPath: string;
    source: "PYQ" | "IMPORTED_BANK" | "GENERATED";
    visibility: "PUBLIC" | "PRIVATE" | "UPCOMING";
    paperId?: EntityId;
    ownerId?: string;
  }): Promise<void>;
}

export type AnswerVerificationDecision = {
  accepted: boolean;
  correctOption?: OptionKey;
  reason: string;
  method: "independent-solver" | "deterministic" | "human" | "unverified";
  confidence: number;
};

export type IndependentSolverResult = {
  answer: OptionKey;
  explanation: string;
  provider: string;
  model: string;
  confidence: number;
};

export interface IndependentSolverPort {
  solve(input: {
    questionText: string;
    options: QuestionOptions;
    language: LanguageCode;
    subjectId: string;
    topicPath: string;
    profileId: AdaptiveExamProfileId;
    requestId: string;
  }): Promise<IndependentSolverResult>;
}

export interface AnswerVerificationPort {
  verify(input: {
    questionText: string;
    options: QuestionOptions;
    claimedOption?: OptionKey;
    language: LanguageCode;
    subjectId: string;
    topicPath: string;
    profileId: AdaptiveExamProfileId;
    evidence?: Array<{ url: string; publishedAt?: IsoTimestamp; snippet?: string }>;
  }): Promise<AnswerVerificationDecision>;
}

export type GenerationJobStage =
  | "prepare"
  | "select"
  | "generate"
  | "verify"
  | "dedupe"
  | "assemble"
  | "persist"
  | "done"
  | "failed";

/** One provider batch, recorded without question text or answers. */
export type GenerationTelemetry = {
  provider: string;
  model: string;
  promptVersion: string;
  mock: boolean;
  batches: number;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

/** Job-level rollup derived only from persisted paper provenance. */
export type GenerationTelemetrySummary = {
  providers: string[];
  models: string[];
  promptVersions: string[];
  mock: boolean;
  batches: number;
  questions: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

/** Appends each real batch to the shared AIUsage ledger. */
export type AdaptiveGenerationTelemetryRecorder = (
  records: GenerationTelemetry[],
  ctx: AdaptiveExecutionContext,
) => Promise<void>;

export type GenerationJob = {
  id: EntityId;
  userId: string;
  blueprintId: EntityId;
  idempotencyKey: string;
  status: "QUEUED" | "RUNNING" | "PARTIAL" | "FAILED" | "COMPLETED";
  stage: GenerationJobStage;
  progress: number;
  total: number;
  paperId?: EntityId;
  attempts: number;
  error?: Record<string, unknown>;
  telemetry?: GenerationTelemetrySummary;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};

export interface GenerationJobStore {
  put(job: GenerationJob): Promise<GenerationJob>;
  get(jobId: EntityId): Promise<GenerationJob | null>;
  findByIdempotencyKey(userId: string, key: string): Promise<GenerationJob | null>;
}

export interface GenerationJobService {
  enqueue(input: {
    userId: string;
    blueprintId: EntityId;
    idempotencyKey: string;
  }): Promise<GenerationJob>;
  get(jobId: EntityId, userId: string): Promise<GenerationJob | null>;
  run(jobId: EntityId, ctx: AdaptiveExecutionContext): Promise<GenerationJob>;
}

export type PublicationStatus = "DRAFT" | "UPCOMING" | "PUBLISHED" | "ARCHIVED";

export type MockPublication = {
  id: EntityId;
  paperId: EntityId;
  status: PublicationStatus;
  titleBn: string;
  titleEn: string;
  availableFrom?: IsoTimestamp;
  availableTo?: IsoTimestamp;
  visibility: "PUBLIC" | "PRIVATE";
  contentHash: string;
  immutable: true;
  createdBy: string;
  createdAt: IsoTimestamp;
};

export interface MockPublicationStore {
  put(publication: MockPublication): Promise<MockPublication>;
  get(paperId: EntityId): Promise<MockPublication | null>;
  getById(id: EntityId): Promise<MockPublication | null>;
  list(statuses?: PublicationStatus[]): Promise<MockPublication[]>;
  /** Only lifecycle status/window fields may change; contentHash never does. */
  updateStatus(
    id: EntityId,
    patch: { status: PublicationStatus; availableFrom?: IsoTimestamp; availableTo?: IsoTimestamp },
  ): Promise<MockPublication>;
}

export interface AdaptiveCatalogStore {
  organizations(): Promise<ExamCatalog["organizations"]>;
  posts(): Promise<ExamCatalog["posts"]>;
  types(): Promise<ExamCatalog["types"]>;
}

export interface AdaptiveCatalogService {
  catalog(): Promise<ExamCatalog>;
  profiles(filter?: { family?: ExamFamily; profileId?: AdaptiveExamProfileId }): Promise<ProfileSummary[]>;
}

export interface AdaptiveLibraryService {
  list(filter?: {
    family?: ExamFamily;
    profileId?: AdaptiveExamProfileId;
    subjectId?: string;
    status?: PublicationStatus;
  }): Promise<Array<MockPublication & { paper?: PaperSnapshot }>>;
  get(paperId: EntityId, viewerId: string): Promise<(MockPublication & { paper?: PaperSnapshot }) | null>;
  publish(input: {
    paperId: EntityId;
    status: PublicationStatus;
    titleBn: string;
    titleEn: string;
    availableFrom?: IsoTimestamp;
    availableTo?: IsoTimestamp;
    actorId: string;
  }): Promise<MockPublication>;
}

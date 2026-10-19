// backend/services/exam-config/index.ts — public surface of the exam-config
// module. Pure (no DB, no `server-only`) so both the backend and the dashboard
// can consume the same canonical paper definitions.

export type {
  AllocationDiagnostic,
  AllocatedSubject,
  AllocatedTopic,
  AllocationOutcome,
  AllocationResult,
  AllocationSource,
  ConfigProvenance,
  ExamConfig,
  ExamEcosystemCode,
  ExamMode,
  ReviewStatus,
  ScopeNode,
  ScopeSelection,
  ScopeSubject,
  ScoringPolicy,
  SubjectNode,
  TopicNode,
  ValidationIssue,
  ValidationResult,
} from "./types";

export {
  allocateScope,
  distributeWeighted,
  largestRemainder,
  sumAllocated,
  type AllocationInput,
} from "./allocation";

export {
  collectConfigIds,
  subjectPaths,
  validateExamConfig,
} from "./validate";

export {
  clearExamConfigValidationCache,
  getExamConfig,
  getExamConfigValidation,
  getExamConfigVersion,
  isExamEcosystemCode,
  listExamConfigVersions,
  listExamEcosystems,
  resolveExamConfig,
  summarizeExamConfig,
  type ExamConfigSummary,
  type ResolvedExamConfig,
} from "./registry";

export { BCS_PRELIMINARY_CONFIG, BCS_SUBJECTS } from "./bcs";
export { BANK_PRELIMINARY_CONFIG, BANK_SUBJECTS } from "./bank";

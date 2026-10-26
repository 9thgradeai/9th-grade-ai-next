// Type-only re-export of the single server contract. Nothing here is emitted
// at runtime: the client never bundles the Zod schema or answer-key code.

export type {
  MCQExplanation as VerifiedExplanationDto,
  OptionAnalysis as VerifiedOptionAnalysis,
  Evidence as VerifiedEvidence,
  EvidenceRecord as VerifiedEvidenceRecord,
  DatabaseAudit as VerifiedDatabaseAudit,
  VerificationStatus as VerifiedStatus,
  QuestionValidity as VerifiedQuestionValidity,
  OptionVerdict as VerifiedOptionVerdict,
  DatabaseAuditStatus as VerifiedDatabaseAuditStatus,
} from "~backend/ai/explain-engine/schema/types";

/**
 * scripts/qb-forensics/issues.ts
 * ----------------------------------------------------------------------------
 * Shared types for the question-bank forensic audit.
 *
 * A record is a single Question row together with its parsed fields. Every
 * detected anomaly becomes an `Issue`. Every proposed change becomes either a
 * `fix` (deterministic, applied by the migration) or a `candidate` (needs a
 * human to confirm; never applied automatically).
 * ----------------------------------------------------------------------------
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type Verdict = "AUTO" | "REVIEW";

export interface QuestionRecord {
  id: number;
  subjectId: number;
  topic: string;
  subtopic: string;
  path: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export type FieldName =
  | "question"
  | "options"
  | "correctAnswer"
  | "explanation"
  | "path"
  | "topic"
  | "subtopic";

export interface Issue {
  /** Machine-readable category. */
  code: string;
  field: FieldName | "record";
  severity: "error" | "warn" | "info";
  detail: string;
  /** When the issue carries a reconstruction hint (e.g. de-shaped text). */
  candidate?: string;
}

export interface FieldChange {
  field: FieldName;
  code: string;
  from: string;
  to: string;
  confidence: Confidence;
}

export interface ReviewCandidate {
  field: FieldName;
  code: string;
  from: string;
  candidate: string;
  confidence: Confidence;
  rationale: string;
}

export interface ClassifiedRecord extends QuestionRecord {
  verdict: Verdict;
  /** reasons that make the record require a human */
  reviewReasons: string[];
  fixes: FieldChange[];
  candidates: ReviewCandidate[];
}

export interface AuditReport {
  generatedAt: string;
  scope: string;
  totals: {
    scanned: number;
    autoFixeable: number;
    reviewRequired: number;
    clean: number;
  };
  issueCounts: Record<string, number>;
  confidenceCounts: Record<Confidence, number>;
  perSubject: Record<string, { scanned: number; review: number; fixed: number; clean: number }>;
  samples: Array<ClassifiedRecord & { changedFields: string[] }>;
}
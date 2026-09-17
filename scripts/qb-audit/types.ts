/**
 * scripts/qb-audit/types.ts
 * ----------------------------------------------------------------------------
 * Shared types for the comprehensive question-bank audit pipeline.
 * ----------------------------------------------------------------------------
 */

export type Confidence = "HIGH" | "MEDIUM" | "LOW";

export type IssueSeverity = "error" | "warn" | "info";

export interface Issue {
  code: string;
  field: string;
  severity: IssueSeverity;
  detail: string;
  confidence: Confidence;
}

export interface QuestionRecord {
  id: number;
  source: "database" | "source-file";
  sourceFile?: string;
  subjectId?: number;
  subjectName?: string;
  topic: string;
  subtopic: string;
  path: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  bcsTerm?: string;
  year?: number;
  sourceKey?: string;
}

export interface NormalizedField {
  field: string;
  before: string;
  after: string;
  codes: string[];
  confidence: Confidence;
}

export interface ClassificationResult {
  record: QuestionRecord;
  issues: Issue[];
  fixes: NormalizedField[];
  qualityScore: number;
  qualityGrade: string;
  verdict: "CLEAN" | "AUTO" | "REVIEW";
  reviewReasons: string[];
}

export interface InventoryReport {
  generatedAt: string;
  totalQuestions: number;
  totalOptions: number;
  totalExplanations: number;
  totalSubjects: number;
  totalTopics: number;
  totalSubtopics: number;
  questionsPerSubject: Record<string, number>;
  questionsPerExam: Record<string, number>;
  questionsWithMissingFields: number;
  questionsWithMalformedFields: number;
  questionsWithSuspiciousEncoding: number;
  questionsWithInconsistentFormatting: number;
  questionsWithDuplicateContent: number;
  questionsWithSuspiciousAnswerMappings: number;
  sourceFiles: number;
  sourceLinesTotal: number;
  dbRecords: number;
}

export interface UnicodeIssue {
  type:
    | "MOJIBAKE"
    | "REPLACEMENT_CHAR"
    | "CONTROL_CHAR"
    | "NON_STANDARD_SPACE"
    | "DOUBLE_ENCODING"
    | "INVALID_SEQUENCE"
    | "BROKEN_BANGLA"
    | "NON_NFC";
  field: string;
  recordId: number;
  snippet: string;
  confidence: Confidence;
  reason: string;
}

export interface StructureIssue {
  type:
    | "MISSING_QUESTION"
    | "EMPTY_QUESTION"
    | "MISSING_OPTIONS"
    | "WRONG_OPTION_COUNT"
    | "EMPTY_OPTION"
    | "DUPLICATE_OPTIONS"
    | "MISSING_ANSWER"
    | "EMPTY_ANSWER"
    | "ANSWER_MISMATCH"
    | "MISSING_EXPLANATION"
    | "EMPTY_EXPLANATION";
  recordId: number;
  detail: string;
  confidence: Confidence;
}

export interface DuplicateGroup {
  type: "EXACT" | "NORMALIZED" | "NEAR";
  records: QuestionRecord[];
  similarity: number;
}

export interface OCRIncident {
  recordId: number;
  field: string;
  original: string;
  suspected: string;
  confidence: Confidence;
  reason: string;
}

export interface QualityScore {
  unicodeIntegrity: number;     // 0-20
  structureIntegrity: number;   // 0-20
  formattingQuality: number;    // 0-15
  optionIntegrity: number;      // 0-15
  explanationIntegrity: number; // 0-10
  metadataIntegrity: number;    // 0-10
  duplicateRisk: number;        // 0-5
  contentIntegrity: number;     // 0-5
  total: number;                // 0-100
  grade: string;
}

export interface AuditReport {
  generatedAt: string;
  scope: "source-files" | "database" | "both";
  inventory: InventoryReport;
  unicodeIssues: UnicodeIssue[];
  structureIssues: StructureIssue[];
  duplicateGroups: DuplicateGroup[];
  ocrIncidents: OCRIncident[];
  classifications: ClassificationResult[];
  totals: {
    scanned: number;
    clean: number;
    autoFixable: number;
    reviewRequired: number;
    critical: number;
  };
  qualityDistribution: Record<string, number>;
  summary: string;
}

export interface ChangeLog {
  questionId: number;
  source: string;
  field: string;
  before: string;
  after: string;
  issueType: string;
  confidence: Confidence;
  reason: string;
  timestamp: string;
  migrationVersion: string;
}

export interface NormalizationPipeline {
  normalizeText(s: string): string;
  normalizeUnicode(s: string): string;
  normalizeWhitespace(s: string): string;
  normalizePunctuation(s: string): string;
  normalizeBangla(s: string): string;
  normalizeEnglish(s: string): string;
  normalizeMath(s: string): string;
  normalizeHTML(s: string): string;
  validateStructure(r: QuestionRecord): Issue[];
}

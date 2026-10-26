// Canonical contract for post-submission MCQ explanations.
//
// This file is the SINGLE source of truth for:
//   • model-output validation (solver + verifier)
//   • the API response contract
//   • cache validation
//   • UI rendering (client imports the types with `import type` only)
//
// It deliberately contains no network/database imports so it stays free of
// answer-key material and can be type-imported from a client component.

import { z } from "zod";

export const EXPLAIN_SCHEMA_VERSION = "2.0.0";
export const EXPLAIN_POLICY_VERSION = "2026-10-26.1";

// ── Verification status ────────────────────────────────────
// Describes HOW the answer was established, not merely whether it is right.
export const VERIFICATION_STATUSES = [
  /** External evidence was retrieved, validated and corroborated the finding. */
  "EVIDENCE_VERIFIED",
  /** Two isolated reasoning passes agreed; no external evidence was needed/used. */
  "INDEPENDENTLY_VERIFIED",
  /** A finding exists but support is partial (single pass, or evidence gaps). */
  "PARTIALLY_VERIFIED",
  /** Competing interpretations / conflicting evidence — no assertion made. */
  "INCONCLUSIVE",
  /** No independent finding was produced (e.g. malformed structure). */
  "NOT_VERIFIED",
  /** The provider failed; the failure is operational, not factual. */
  "PROVIDER_FAILED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VerificationStatus = {
  EVIDENCE_VERIFIED: "EVIDENCE_VERIFIED",
  INDEPENDENTLY_VERIFIED: "INDEPENDENTLY_VERIFIED",
  PARTIALLY_VERIFIED: "PARTIALLY_VERIFIED",
  INCONCLUSIVE: "INCONCLUSIVE",
  NOT_VERIFIED: "NOT_VERIFIED",
  PROVIDER_FAILED: "PROVIDER_FAILED",
} as const satisfies Record<string, VerificationStatus>;
export const VerificationStatusSchema = z.enum(VERIFICATION_STATUSES);

// ── Question validity ──────────────────────────────────────
export const QUESTION_VALIDITIES = [
  "VALID_SINGLE_ANSWER",
  "VALID_MULTIPLE_ANSWERS",
  "NO_CORRECT_OPTION",
  "AMBIGUOUS",
  "INCOMPLETE_OR_MALFORMED",
  "OUTDATED_OR_CONTEXT_DEPENDENT",
  "INCONCLUSIVE",
] as const;
export type QuestionValidity = (typeof QUESTION_VALIDITIES)[number];
export const QuestionValidity = {
  VALID_SINGLE_ANSWER: "VALID_SINGLE_ANSWER",
  VALID_MULTIPLE_ANSWERS: "VALID_MULTIPLE_ANSWERS",
  NO_CORRECT_OPTION: "NO_CORRECT_OPTION",
  AMBIGUOUS: "AMBIGUOUS",
  INCOMPLETE_OR_MALFORMED: "INCOMPLETE_OR_MALFORMED",
  OUTDATED_OR_CONTEXT_DEPENDENT: "OUTDATED_OR_CONTEXT_DEPENDENT",
  INCONCLUSIVE: "INCONCLUSIVE",
} as const satisfies Record<string, QuestionValidity>;
export const QuestionValiditySchema = z.enum(QUESTION_VALIDITIES);

// ── Per-option verdict ─────────────────────────────────────
export const OPTION_VERDICTS = [
  "CORRECT",
  "INCORRECT",
  "CONDITIONALLY_CORRECT",
  "INDETERMINATE",
] as const;
export type OptionVerdict = (typeof OPTION_VERDICTS)[number];
export const OptionVerdict = {
  CORRECT: "CORRECT",
  INCORRECT: "INCORRECT",
  CONDITIONALLY_CORRECT: "CONDITIONALLY_CORRECT",
  INDETERMINATE: "INDETERMINATE",
} as const satisfies Record<string, OptionVerdict>;
export const OptionVerdictSchema = z.enum(OPTION_VERDICTS);

// ── Database-key audit ─────────────────────────────────────
export const DATABASE_AUDIT_STATUSES = [
  "NOT_AUDITED",
  "AGREES",
  "KEY_MISMATCH",
  "INVALID_QUESTION",
  "MULTIPLE_ANSWERS",
  "AMBIGUOUS_QUESTION",
  "CONTEXT_OR_DATE_MISMATCH",
  "INCONCLUSIVE",
] as const;
export type DatabaseAuditStatus = (typeof DATABASE_AUDIT_STATUSES)[number];
export const DatabaseAuditStatus = {
  NOT_AUDITED: "NOT_AUDITED",
  AGREES: "AGREES",
  KEY_MISMATCH: "KEY_MISMATCH",
  INVALID_QUESTION: "INVALID_QUESTION",
  MULTIPLE_ANSWERS: "MULTIPLE_ANSWERS",
  AMBIGUOUS_QUESTION: "AMBIGUOUS_QUESTION",
  CONTEXT_OR_DATE_MISMATCH: "CONTEXT_OR_DATE_MISMATCH",
  INCONCLUSIVE: "INCONCLUSIVE",
} as const satisfies Record<string, DatabaseAuditStatus>;
export const DatabaseAuditStatusSchema = z.enum(DATABASE_AUDIT_STATUSES);

// ── Evidence ───────────────────────────────────────────────
export const EVIDENCE_SEARCH_STATUSES = [
  "NOT_ATTEMPTED",
  "LIVE_SEARCH",
  "CACHED_EVIDENCE",
  "NO_RESULTS",
  "UNAVAILABLE",
  "FAILED",
] as const;
export type EvidenceSearchStatus = (typeof EVIDENCE_SEARCH_STATUSES)[number];
export const EvidenceSearchStatusSchema = z.enum(EVIDENCE_SEARCH_STATUSES);

export const EVIDENCE_TYPES = [
  "PRIMARY",
  "OFFICIAL",
  "REPUTABLE",
  "REFERENCE",
  "DERIVED",
  "UNVERIFIED",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EvidenceTypeSchema = z.enum(EVIDENCE_TYPES);

export const EvidenceRecordSchema = z
  .object({
    /** Stable local ID (`e1`, `e2`, …); claims reference these, never raw URLs. */
    id: z.string().min(1).max(40),
    title: z.string().max(400),
    publisher: z.string().max(200).nullable(),
    /** Nullable for deterministic/model-knowledge evidence that has no URL. */
    url: z.string().max(2_000).nullable(),
    publicationDate: z.string().max(40).nullable(),
    effectiveDate: z.string().max(40).nullable(),
    accessedAt: z.string().datetime(),
    excerpt: z.string().max(1_200).nullable(),
    claimSupported: z.string().max(600).nullable(),
    evidenceType: EvidenceTypeSchema,
    supportsOptionIds: z.array(z.string().max(120)).max(10),
    limitations: z.string().max(600).nullable(),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    searchStatus: EvidenceSearchStatusSchema,
    searchPerformed: z.boolean(),
    searchSuccess: z.boolean(),
    queries: z.array(z.string().max(400)).max(4),
    records: z.array(EvidenceRecordSchema).max(12),
    sourcesUsed: z.array(z.string().max(120)).max(12),
    conflicting: z.boolean(),
    conflictDetails: z.string().max(1_000).nullable(),
    /** Number of records whose URL passed the safety policy. */
    validatedSourceCount: z.number().int().min(0),
  })
  .strict();

// ── Options ────────────────────────────────────────────────
export const OptionAnalysisSchema = z
  .object({
    /** Canonical, server-derived ID — never a client position. */
    originalOptionId: z.string().min(1).max(120),
    /** Authored label (A/B/C/D as stored by the question bank). */
    label: z.string().min(1).max(3),
    /** Exact stored option text (display text, not normalised). */
    text: z.string().min(1).max(4_000),
    verdict: OptionVerdictSchema,
    explanation: z.string().min(1).max(2_000),
    evidenceIds: z.array(z.string().max(40)).max(6),
    conditions: z.string().max(600).nullable(),
    limitations: z.string().max(600).nullable(),
  })
  .strict();

export const IndependentAnswerSchema = z
  .object({
    established: z.boolean(),
    acceptedOptionIds: z.array(z.string().max(120)).max(10),
    summary: z.string().max(1_200).nullable(),
  })
  .strict();

export const InvalidInputSchema = z
  .object({
    reason: z.string().min(1).max(600),
    optionCount: z.number().int().min(0).max(12),
    issues: z.array(z.string().max(300)).max(12),
  })
  .strict();

export const AmbiguityOrDefectSchema = z
  .object({
    detected: z.boolean(),
    type: z.string().max(80).nullable(),
    explanation: z.string().max(1_200).nullable(),
  })
  .strict();

export const DatabaseAuditSchema = z
  .object({
    agreedWithDatabase: z.boolean(),
    databaseOptionIds: z.array(z.string().max(120)).max(10),
    /** Only populated on a discrepancy, so the UI can explain it explicitly. */
    databaseKeyText: z.string().max(2_000).nullable(),
    discrepancyExplanation: z.string().max(1_200).nullable(),
    /** Overlapping findings remain representable. */
    findings: z
      .object({
        keyMismatch: z.boolean(),
        invalidQuestion: z.boolean(),
        multipleAnswers: z.boolean(),
        ambiguous: z.boolean(),
        contextOrDateMismatch: z.boolean(),
        inconclusive: z.boolean(),
      })
      .strict(),
    reviewStatus: z.enum(["NOT_REQUIRED", "PENDING_REVIEW", "REVIEWED"]),
  })
  .strict();

export const ExplanationMetadataSchema = z
  .object({
    provider: z.string().max(60).nullable(),
    model: z.string().max(120).nullable(),
    searchCalls: z.number().int().min(0),
    llmCalls: z.number().int().min(0),
    latencyMs: z.number().int().min(0),
    cacheHit: z.boolean(),
    solverPasses: z.number().int().min(0),
    verifierAgreement: z.boolean().nullable(),
    contentHash: z.string().min(8).max(80),
    promptVersion: z.string().max(40),
  })
  .strict();

const STUDENT_RESULTS = ["CORRECT", "INCORRECT", "UNANSWERED", "NOT_SCORED"] as const;
export type StudentResult = (typeof STUDENT_RESULTS)[number];

/** The persisted/rendered explanation contract. */
export const MCQExplanationSchema = z
  .object({
    schemaVersion: z.literal(EXPLAIN_SCHEMA_VERSION),
    policyVersion: z.literal(EXPLAIN_POLICY_VERSION),
    questionId: z.number().int().positive(),
    questionVersion: z.string().min(8).max(80),
    verificationStatus: VerificationStatusSchema,
    questionValidity: QuestionValiditySchema,
    independentAnswer: IndependentAnswerSchema,
    acceptedOptionIds: z.array(z.string().max(120)).max(10),
    optionsAnalysis: z.array(OptionAnalysisSchema).max(12),
    selectedOptionId: z.string().max(120).nullable(),
    /** Every option the student selected (multi-answer questions are sets). */
    selectedOptionIds: z.array(z.string().max(120)).max(10),
    /** Result under the ORIGINAL stored key — never rewritten by AI. */
    studentResult: z.enum(STUDENT_RESULTS),
    studentResultBasis: z.literal("DATABASE_KEY"),
    /** How the student would fare if the independent finding were applied. */
    independentStudentResult: z.enum(STUDENT_RESULTS).nullable(),
    correctedAnswer: z
      .object({
        established: z.boolean(),
        acceptedOptionIds: z.array(z.string().max(120)).max(10),
        answerText: z.string().max(4_000).nullable(),
      })
      .strict()
      .nullable(),
    ambiguityOrDefect: AmbiguityOrDefectSchema.nullable(),
    invalidInput: InvalidInputSchema.nullable(),
    coreConcept: z.string().max(2_000),
    solutionSteps: z.array(z.string().max(1_500)).max(20),
    fastSolvingMethod: z.string().max(1_200).nullable(),
    evidence: EvidenceSchema,
    databaseAuditStatus: DatabaseAuditStatusSchema,
    databaseAudit: DatabaseAuditSchema.nullable(),
    limitations: z.array(z.string().max(600)).max(12),
    generatedAt: z.string().datetime(),
    metadata: ExplanationMetadataSchema.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const optionIds = value.optionsAnalysis.map((o) => o.originalOptionId);
    const optionIdSet = new Set(optionIds);
    const acceptedSet = new Set(value.acceptedOptionIds);

    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    // Unique option analyses, unique accepted IDs.
    if (optionIdSet.size !== optionIds.length) {
      issue(["optionsAnalysis"], "Option analyses must have unique originalOptionId values.");
    }
    if (acceptedSet.size !== value.acceptedOptionIds.length) {
      issue(["acceptedOptionIds"], "acceptedOptionIds must be unique.");
    }
    const sameIdSet = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((id) => b.includes(id));
    if (!sameIdSet(value.acceptedOptionIds, value.independentAnswer.acceptedOptionIds)) {
      issue(
        ["acceptedOptionIds"],
        "acceptedOptionIds must equal independentAnswer.acceptedOptionIds.",
      );
    }
    if (
      value.correctedAnswer &&
      !sameIdSet(value.correctedAnswer.acceptedOptionIds, value.acceptedOptionIds)
    ) {
      issue(
        ["correctedAnswer", "acceptedOptionIds"],
        "correctedAnswer.acceptedOptionIds must equal the independent finding.",
      );
    }

    // Accepted IDs must be analysed options (except explicit invalid input,
    // where no analyses may exist).
    for (const id of value.acceptedOptionIds) {
      if (!optionIdSet.has(id)) {
        issue(["acceptedOptionIds"], `Accepted option "${id}" is not present in optionsAnalysis.`);
      }
    }

    // Every evidence reference must exist.
    const evidenceIds = new Set(value.evidence.records.map((r) => r.id));
    if (evidenceIds.size !== value.evidence.records.length) {
      issue(["evidence", "records"], "Evidence record IDs must be unique.");
    }
    for (const [i, opt] of value.optionsAnalysis.entries()) {
      for (const ref of opt.evidenceIds) {
        if (!evidenceIds.has(ref)) {
          issue(
            ["optionsAnalysis", i, "evidenceIds"],
            `Evidence reference "${ref}" does not exist in evidence.records.`,
          );
        }
      }
    }

    // Selected option identity.
    for (const id of value.selectedOptionIds) {
      if (!optionIdSet.has(id)) {
        issue(["selectedOptionIds"], `Selected option "${id}" is not an analysed option.`);
      }
    }
    if (new Set(value.selectedOptionIds).size !== value.selectedOptionIds.length) {
      issue(["selectedOptionIds"], "selectedOptionIds must be unique.");
    }
    if (value.selectedOptionIds.length === 1) {
      if (value.selectedOptionId !== value.selectedOptionIds[0]) {
        issue(["selectedOptionId"], "selectedOptionId must equal the single selected option.");
      }
    } else if (value.selectedOptionId !== null) {
      issue(["selectedOptionId"], "selectedOptionId must be null unless exactly one option is selected.");
    }
    if (value.studentResult === "UNANSWERED" && value.selectedOptionIds.length !== 0) {
      issue(["studentResult"], "UNANSWERED requires no selected options.");
    }
    if (value.studentResult !== "UNANSWERED" && value.selectedOptionIds.length === 0) {
      issue(["studentResult"], "A scored result requires at least one selected option.");
    }
    if (
      value.selectedOptionIds.length > 0 &&
      (value.studentResult === "CORRECT" || value.studentResult === "INCORRECT")
    ) {
      const dbIds = value.databaseAudit?.databaseOptionIds;
      if (dbIds && dbIds.length > 0) {
        const sameSet =
          dbIds.length === value.selectedOptionIds.length &&
          dbIds.every((id) => value.selectedOptionIds.includes(id));
        if (sameSet !== (value.studentResult === "CORRECT")) {
          issue(
            ["studentResult"],
            "studentResult must match the original database key (all-or-nothing), not the independent finding.",
          );
        }
      }
    }

    // Validity ↔ independent-answer consistency.
    const acceptedCount = value.acceptedOptionIds.length;
    switch (value.questionValidity) {
      case "VALID_SINGLE_ANSWER":
        if (!value.independentAnswer.established || acceptedCount !== 1) {
          issue(
            ["acceptedOptionIds"],
            "VALID_SINGLE_ANSWER requires an established answer with exactly one accepted option.",
          );
        }
        break;
      case "VALID_MULTIPLE_ANSWERS":
        if (!value.independentAnswer.established || acceptedCount < 2) {
          issue(
            ["acceptedOptionIds"],
            "VALID_MULTIPLE_ANSWERS requires an established answer with at least two accepted options.",
          );
        }
        break;
      case "NO_CORRECT_OPTION":
        if (!value.independentAnswer.established || acceptedCount !== 0) {
          issue(
            ["acceptedOptionIds"],
            "NO_CORRECT_OPTION must be an established finding with no accepted option.",
          );
        }
        break;
      case "INCOMPLETE_OR_MALFORMED":
        if (!value.invalidInput) {
          issue(["invalidInput"], "INCOMPLETE_OR_MALFORMED requires an invalidInput record.");
        }
        break;
      case "OUTDATED_OR_CONTEXT_DEPENDENT":
        if (value.limitations.length === 0) {
          issue(["limitations"], "Context-dependent results must record their limitations.");
        }
        break;
      default:
        break;
    }

    // Verdict consistency with the accepted set.
    const correctVerdicts = value.optionsAnalysis.filter((o) => o.verdict === "CORRECT");
    if (
      value.questionValidity === "VALID_SINGLE_ANSWER" ||
      value.questionValidity === "VALID_MULTIPLE_ANSWERS"
    ) {
      for (const opt of correctVerdicts) {
        if (!acceptedSet.has(opt.originalOptionId)) {
          issue(
            ["optionsAnalysis"],
            "A CORRECT verdict must be listed in acceptedOptionIds.",
          );
        }
      }
      for (const id of value.acceptedOptionIds) {
        const opt = value.optionsAnalysis.find((o) => o.originalOptionId === id);
        if (!opt || opt.verdict !== "CORRECT") {
          issue(
            ["optionsAnalysis"],
            "Each accepted option must carry a CORRECT verdict.",
          );
        }
      }
    }
    if (value.questionValidity === "NO_CORRECT_OPTION" && correctVerdicts.length > 0) {
      issue(["optionsAnalysis"], "NO_CORRECT_OPTION cannot contain a CORRECT verdict.");
    }

    // Claimed verification must actually be backed.
    if (value.verificationStatus === "EVIDENCE_VERIFIED") {
      if (!value.evidence.searchSuccess || value.evidence.validatedSourceCount === 0) {
        issue(
          ["verificationStatus"],
          "EVIDENCE_VERIFIED requires a successful search and at least one validated source.",
        );
      }
    }
    if (
      value.verificationStatus === "EVIDENCE_VERIFIED" ||
      value.verificationStatus === "INDEPENDENTLY_VERIFIED"
    ) {
      if (!value.independentAnswer.established) {
        issue(["verificationStatus"], "A verified status requires an established finding.");
      }
    }

    // Database audit ↔ finding consistency.
    if (value.databaseAuditStatus === "AGREES") {
      if (!value.databaseAudit?.agreedWithDatabase) {
        issue(["databaseAuditStatus"], "AGREES requires databaseAudit.agreedWithDatabase = true.");
      }
    }
    if (value.databaseAuditStatus === "KEY_MISMATCH") {
      if (value.databaseAudit?.agreedWithDatabase !== false) {
        issue(["databaseAuditStatus"], "KEY_MISMATCH requires an explicit disagreement record.");
      }
      if (!value.independentAnswer.established) {
        issue(["databaseAuditStatus"], "KEY_MISMATCH requires an established independent finding.");
      }
    }

    // A malformed question must not manufacture answer analyses beyond the
    // options that actually exist.
    if (value.invalidInput && value.optionsAnalysis.length > value.invalidInput.optionCount) {
      issue(
        ["optionsAnalysis"],
        "Cannot analyse more options than the malformed question actually contains.",
      );
    }

    // The four-option invariant: a structurally valid question must analyse
    // exactly the four original options.
    if (
      value.questionValidity === "VALID_SINGLE_ANSWER" ||
      value.questionValidity === "VALID_MULTIPLE_ANSWERS"
    ) {
      if (value.optionsAnalysis.length !== 4) {
        issue(
          ["optionsAnalysis"],
          "Valid four-option MCQs must contain exactly four option analyses.",
        );
      }
    }
  });

export type MCQExplanation = z.infer<typeof MCQExplanationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export type OptionAnalysis = z.infer<typeof OptionAnalysisSchema>;
export type IndependentAnswer = z.infer<typeof IndependentAnswerSchema>;
export type DatabaseAudit = z.infer<typeof DatabaseAuditSchema>;
export type ExplanationMetadata = z.infer<typeof ExplanationMetadataSchema>;

/** Shape cached for reuse across students (contains no student data). */
export const VerificationFindingSchema = z
  .object({
    questionVersion: z.string().min(8).max(80),
    questionValidity: QuestionValiditySchema,
    independentAnswer: IndependentAnswerSchema,
    optionsAnalysis: z.array(OptionAnalysisSchema).max(12),
    coreConcept: z.string().max(2_000),
    solutionSteps: z.array(z.string().max(1_500)).max(20),
    fastSolvingMethod: z.string().max(1_200).nullable(),
    ambiguityOrDefect: AmbiguityOrDefectSchema.nullable(),
    invalidInput: InvalidInputSchema.nullable(),
    evidence: EvidenceSchema,
    limitations: z.array(z.string().max(600)).max(12),
    verificationStatus: VerificationStatusSchema,
    verifierAgreement: z.boolean().nullable(),
    cachedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    provider: z.string().max(60).nullable(),
    model: z.string().max(120).nullable(),
    llmCalls: z.number().int().min(0),
    searchCalls: z.number().int().min(0),
    promptVersion: z.string().max(40),
  })
  .strict();

export type VerificationFinding = z.infer<typeof VerificationFindingSchema>;

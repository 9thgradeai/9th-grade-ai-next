// Verification orchestrator — coordinates the isolated trust stages.
//
//   snapshot (no key) → evidence (untrusted) → solver (no key)
//     → second-pass verifier (no key) → audit (key read here) → contract
//
// Bounded: one solver chain (max 2 attempts per provider), one verifier call,
// at most two searches, hard timeouts, response dedup, content-hash caching.

import "server-only";

import { AppError, NotFoundError } from "~backend/errors";
import { log } from "~backend/infrastructure/observability/logger";
import { auditLog } from "../security/hardening";
import { aiCacheGet, aiCacheKey, aiCacheSet } from "../infrastructure/ai-cache";
import { deduplicate } from "../infrastructure/dedup";
import { resolveExplainCandidates, type ModelSelection } from "../providers/registry";
import type { LLMProviderName } from "../providers/types";
import {
  loadCanonicalAnswerKey,
  loadCanonicalSnapshot,
  verifyDisplayOptions,
  type CanonicalSnapshot,
} from "./canonical-snapshot";
import { gatherEvidence, validateEvidenceRefs } from "./evidence";
import { runIndependentSolver, type SolverDraft, type SolverRun } from "./solver/independent-solver";
import { verifyIndependently } from "./verify/verifier";
import {
  auditDatabaseKey,
  independentStudentResult,
  originalStudentResult,
} from "./audit/database-audit";
import {
  DatabaseAuditStatus,
  EXPLAIN_POLICY_VERSION,
  EXPLAIN_SCHEMA_VERSION,
  MCQExplanationSchema,
  VerificationFindingSchema,
  VerificationStatus,
  type Evidence,
  type MCQExplanation,
  type OptionAnalysis,
  type QuestionValidity as QuestionValidityType,
  type VerificationFinding,
} from "./schema/types";
import type { ExplainV2Request } from "./schema/input";
import { detectUnicodeIssues, looksLikeMath, sha256Hex } from "./text";

const PROMPT_VERSION = "explain-v2.1";
const SOLVER_TIMEOUT_MS = 22_000;
const VERIFIER_TIMEOUT_MS = 17_000;
const SEARCH_TIMEOUT_MS = 8_000;
const GENERAL_TTL_MS = 6 * 60 * 60 * 1_000;
const CURRENT_AFFAIRS_TTL_MS = 45 * 60 * 1_000;
const INCONCLUSIVE_TTL_MS = 30 * 60 * 1_000;

const CURRENT_AFFAIRS = /(current affairs|সাম্প্রতিক|চলমান|বিশ্ব|আন্তর্জাতিক)/i;

export type ExplainDeps = {
  loadSnapshot?: typeof loadCanonicalSnapshot;
  loadKey?: typeof loadCanonicalAnswerKey;
  gatherEvidenceFn?: typeof gatherEvidence;
  resolveCandidates?: () => ModelSelection[];
  persistAudit?: typeof auditLog;
  now?: () => Date;
};

function emptyEvidence(): Evidence {
  return {
    searchStatus: "NOT_ATTEMPTED",
    searchPerformed: false,
    searchSuccess: false,
    queries: [],
    records: [],
    sourcesUsed: [],
    conflicting: false,
    conflictDetails: null,
    validatedSourceCount: 0,
  };
}

function toOptionsAnalysis(
  snapshot: CanonicalSnapshot,
  draft: SolverDraft | null,
  evidence: Evidence,
  extraLimitations: string[],
): OptionAnalysis[] {
  return snapshot.options.map((option) => {
    const verdict = draft?.optionVerdicts.find((v) => v.originalOptionId === option.id);
    if (!verdict) {
      return {
        originalOptionId: option.id,
        label: option.label,
        text: option.text,
        verdict: "INDETERMINATE",
        explanation:
          "This option could not be evaluated because the question structure is invalid or the independent finding could not be produced.",
        evidenceIds: [],
        conditions: null,
        limitations: extraLimitations[0] ?? null,
      };
    }
    const { validIds, unknownIds } = validateEvidenceRefs(evidence, verdict.evidenceIds ?? []);
    const limitations = [
      verdict.limitations ?? "",
      unknownIds.length > 0 ? `Dropped invalid evidence reference(s): ${unknownIds.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      originalOptionId: option.id,
      label: option.label,
      text: option.text,
      verdict: verdict.verdict,
      explanation: verdict.explanation,
      evidenceIds: validIds,
      conditions: verdict.conditions ?? null,
      limitations: limitations || null,
    };
  });
}

function deriveDefect(
  validity: QuestionValidityType,
  draft: SolverDraft | null,
  snapshot: CanonicalSnapshot,
): MCQExplanation["ambiguityOrDefect"] {
  if (draft?.ambiguityOrDefect?.detected) {
    return {
      detected: true,
      type: draft.ambiguityOrDefect.type ?? null,
      explanation: draft.ambiguityOrDefect.explanation ?? null,
    };
  }
  switch (validity) {
    case "VALID_MULTIPLE_ANSWERS":
      return {
        detected: true,
        type: "MULTIPLE_CORRECT_ANSWERS",
        explanation:
          "More than one option is independently defensible. If the examination format requires a single answer, this item is defective.",
      };
    case "NO_CORRECT_OPTION":
      return {
        detected: true,
        type: "NO_CORRECT_OPTION",
        explanation:
          "None of the listed options is independently correct under the ordinary reading of the stem.",
      };
    case "AMBIGUOUS":
      return {
        detected: true,
        type: "AMBIGUOUS_WORDING",
        explanation:
          "The wording permits competing reasonable interpretations; the answer changes with the reading.",
      };
    case "INCOMPLETE_OR_MALFORMED":
      return {
        detected: true,
        type: "MALFORMED_STRUCTURE",
        explanation: snapshot.structuralIssues.join("; "),
      };
    case "OUTDATED_OR_CONTEXT_DEPENDENT":
      return {
        detected: true,
        type: "CONTEXT_DEPENDENT",
        explanation:
          "The defensible answer depends on the applicable date, jurisdiction, or version.",
      };
    default:
      return null;
  }
}

function cacheTtlFor(snapshot: CanonicalSnapshot, verdict: VerificationStatus): number {
  if (verdict === VerificationStatus.INCONCLUSIVE) return INCONCLUSIVE_TTL_MS;
  const haystack = `${snapshot.context.subject ?? ""} ${snapshot.context.topic ?? ""}`;
  if (CURRENT_AFFAIRS.test(haystack)) return CURRENT_AFFAIRS_TTL_MS;
  const year = snapshot.context.contextYear;
  if (year != null && year >= new Date().getUTCFullYear() - 2) return CURRENT_AFFAIRS_TTL_MS;
  return GENERAL_TTL_MS;
}

function malformedFinding(
  snapshot: CanonicalSnapshot,
  selectionLimitations: string[],
): VerificationFinding {
  const now = new Date();
  return {
    questionVersion: snapshot.questionVersion,
    questionValidity: "INCOMPLETE_OR_MALFORMED",
    independentAnswer: {
      established: false,
      acceptedOptionIds: [],
      summary:
        "The stored question structure is defective, so no independent answer can be asserted. The source record is preserved and flagged.",
    },
    optionsAnalysis: snapshot.options.map((option) => ({
      originalOptionId: option.id,
      label: option.label,
      text: option.text,
      verdict: "INDETERMINATE" as const,
      explanation:
        "Not evaluated: the question structure is invalid (missing, duplicated, empty, or non-four-option structure).",
      evidenceIds: [],
      conditions: null,
      limitations: snapshot.structuralIssues.join("; "),
    })),
    coreConcept: "Question-bank structural integrity.",
    solutionSteps: [],
    fastSolvingMethod: null,
    ambiguityOrDefect: {
      detected: true,
      type: "MALFORMED_STRUCTURE",
      explanation: snapshot.structuralIssues.join("; "),
    },
    invalidInput: {
      reason: "The question record is not a well-formed four-option MCQ.",
      optionCount: snapshot.options.length,
      issues: [...snapshot.structuralIssues, ...selectionLimitations].slice(0, 12),
    },
    evidence: emptyEvidence(),
    limitations: [
      "The question was not sent to a model: a malformed structure cannot be repaired without inventing content.",
      ...selectionLimitations,
    ],
    verificationStatus: VerificationStatus.NOT_VERIFIED,
    verifierAgreement: null,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + INCONCLUSIVE_TTL_MS).toISOString(),
    provider: null,
    model: null,
    llmCalls: 0,
    searchCalls: 0,
    promptVersion: PROMPT_VERSION,
  };
}

async function verifyQuestion(
  snapshot: CanonicalSnapshot,
  deps: ExplainDeps,
  enableSearch: boolean,
): Promise<{ finding: VerificationFinding; cacheHit: boolean }> {
  const now = deps.now?.() ?? new Date();
  const candidates = (deps.resolveCandidates ?? resolveExplainCandidates)();
  const providerKey = candidates.map((c) => `${c.name}:${c.provider.model}`).join(",");

  const cacheKey = aiCacheKey([
    "explain-v2-verification",
    EXPLAIN_SCHEMA_VERSION,
    EXPLAIN_POLICY_VERSION,
    PROMPT_VERSION,
    snapshot.questionVersion,
    providerKey,
    enableSearch ? "search" : "nosearch",
  ]);

  const cachedRaw = await aiCacheGet(cacheKey);
  if (cachedRaw) {
    try {
      const parsed = VerificationFindingSchema.parse(JSON.parse(cachedRaw));
      if (
        parsed.questionVersion === snapshot.questionVersion &&
        Date.parse(parsed.expiresAt) > now.getTime()
      ) {
        return { finding: parsed, cacheHit: true };
      }
    } catch {
      // Ignore corrupt cache entries and recompute.
    }
  }

  let evidence = await (deps.gatherEvidenceFn ?? gatherEvidence)(snapshot, {
    enabled: enableSearch,
    timeoutMs: SEARCH_TIMEOUT_MS,
  });

  // ── Solver: try the provider chain, never fall through to the key. ──
  let solverRun: SolverRun | null = null;
  const solverFailures: string[] = [];
  for (const candidate of candidates) {
    const run = await runIndependentSolver(candidate.provider, snapshot, {
      evidence,
      timeoutMs: SOLVER_TIMEOUT_MS,
    });
    if (run.draft) {
      solverRun = run;
      break;
    }
    solverFailures.push(`${candidate.name}:${run.failure ?? "unknown"}`);
  }

  if (!solverRun?.draft) {
    log.warn("explain-v2.solver_failed", {
      questionId: snapshot.questionId,
      failures: solverFailures.join(","),
    });
    throw new AppError(
      502,
      "Independent verification is temporarily unavailable. Please retry, or use the unverified explanation.",
      "AI_VERIFICATION_UNAVAILABLE",
    );
  }

  // ── Verifier: prefer a DIFFERENT real provider for genuine independence. ──
  const solverProviderName = solverRun.provider as LLMProviderName;
  const verifierCandidate =
    candidates.find((c) => c.name !== solverProviderName && c.name !== "mock") ??
    candidates.find((c) => c.name !== "mock") ??
    candidates[0];

  let draft = solverRun.draft;
  let verifierAgreement: boolean | null = null;
  let conflictingEvidence = false;
  let verifierIssues: string[] = [];
  let llmCalls = solverRun.attempts;
  let verifierProvider: string | null = null;
  let verifierModel: string | null = null;

  if (verifierCandidate) {
    const outcome = await verifyIndependently(
      verifierCandidate.provider,
      snapshot,
      draft,
      evidence,
      { timeoutMs: VERIFIER_TIMEOUT_MS },
    );
    draft = outcome.draft;
    verifierAgreement = outcome.verifierAgreement;
    conflictingEvidence = outcome.conflictingEvidence;
    verifierIssues = outcome.issues;
    llmCalls += outcome.llmCalls;
    verifierProvider = outcome.provider;
    verifierModel = outcome.model;

    if (verifierAgreement === false || conflictingEvidence) {
      draft = {
        ...draft,
        questionValidity: "INCONCLUSIVE",
        independentAnswer: {
          established: false,
          acceptedOptionIds: [],
          summary:
            "The independent passes or the retrieved evidence conflicted; no single answer is asserted.",
        },
      };
    }
    if (conflictingEvidence) {
      evidence = {
        ...evidence,
        conflicting: true,
        conflictDetails:
          verifierIssues.join(" ").slice(0, 1_000) ||
          "The verifier found conflicting evidence; no single answer is asserted.",
      };
    }
  }

  const validity = draft.questionValidity;
  const established = draft.independentAnswer.established;

  let verificationStatus: VerificationStatus;
  if (validity === "INCOMPLETE_OR_MALFORMED") {
    verificationStatus = VerificationStatus.NOT_VERIFIED;
  } else if (!established) {
    verificationStatus = VerificationStatus.INCONCLUSIVE;
  } else if (verifierAgreement === true && evidence.validatedSourceCount > 0) {
    verificationStatus = VerificationStatus.EVIDENCE_VERIFIED;
  } else if (verifierAgreement === true) {
    verificationStatus = VerificationStatus.INDEPENDENTLY_VERIFIED;
  } else {
    verificationStatus = VerificationStatus.PARTIALLY_VERIFIED;
  }

  const unicodeFindings = [
    ...detectUnicodeIssues(snapshot.questionText),
    ...snapshot.options.flatMap((o) => detectUnicodeIssues(o.text)),
  ];
  const limitations: string[] = [...(draft.limitations ?? []), ...verifierIssues];

  switch (evidence.searchStatus) {
    case "UNAVAILABLE":
      limitations.push(
        "Live web search was unavailable, so no claim was externally verified. This is not evidence against any option.",
      );
      break;
    case "FAILED":
      limitations.push(
        "Live web search failed. No source verification occurred, and the failure says nothing about which option is correct.",
      );
      break;
    case "NO_RESULTS":
      limitations.push("Live search returned no usable sources for this question.");
      break;
    case "CACHED_EVIDENCE":
      limitations.push("Evidence was served from a recent cache, not a fresh search.");
      break;
    case "NOT_ATTEMPTED":
      if (looksLikeMath(snapshot.questionText)) {
        limitations.push(
          "This is a computational question; the finding was derived without web search.",
        );
      }
      break;
    default:
      break;
  }

  if (verifierAgreement === null) {
    limitations.push(
      "The second verification pass was unavailable; the result rests on a single reasoning pass.",
    );
  }
  if (evidence.conflicting) {
    limitations.push("Retrieved sources conflict on part of this claim.");
  }
  if (unicodeFindings.length > 0) {
    limitations.push(
      `Unicode integrity check found ${unicodeFindings.length} suspicious character(s) in the stored text; the original characters were preserved.`,
    );
  }
  if (snapshot.selectionIssues.length > 0) {
    limitations.push(
      `The submitted selection could not be mapped exactly (${snapshot.selectionIssues.join(", ")}).`,
    );
  }

  const dedupedLimitations = Array.from(new Set(limitations.filter(Boolean))).slice(0, 12);

  const finding: VerificationFinding = {
    questionVersion: snapshot.questionVersion,
    questionValidity: validity,
    independentAnswer: {
      established: draft.independentAnswer.established,
      acceptedOptionIds: draft.independentAnswer.acceptedOptionIds,
      summary: draft.independentAnswer.summary ?? null,
    },
    optionsAnalysis: toOptionsAnalysis(snapshot, draft, evidence, dedupedLimitations),
    coreConcept: draft.coreConcept?.trim() || "No governing concept was produced.",
    solutionSteps: draft.solutionSteps ?? [],
    fastSolvingMethod: draft.fastSolvingMethod ?? null,
    ambiguityOrDefect: deriveDefect(validity, draft, snapshot),
    invalidInput: null,
    evidence,
    limitations: dedupedLimitations,
    verificationStatus,
    verifierAgreement,
    cachedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + cacheTtlFor(snapshot, verificationStatus)).toISOString(),
    provider: `${solverRun.provider}${verifierProvider && verifierProvider !== solverRun.provider ? `+${verifierProvider}` : ""}`,
    model: `${solverRun.model}${verifierModel && verifierModel !== solverRun.model ? `+${verifierModel}` : ""}`,
    llmCalls,
    searchCalls: evidence.searchPerformed ? evidence.queries.length : 0,
    promptVersion: PROMPT_VERSION,
  };

  await aiCacheSet(cacheKey, JSON.stringify(finding));
  return { finding, cacheHit: false };
}

async function buildResult(
  userId: string,
  request: ExplainV2Request,
  deps: ExplainDeps,
): Promise<MCQExplanation> {
  const started = Date.now();
  const snapshot = await (deps.loadSnapshot ?? loadCanonicalSnapshot)(request.questionId, {
    attemptId: request.attemptId,
    selectedOptionId: request.selectedOptionId,
    selectedOptionIds: request.selectedOptionIds,
    selectedAnswer: request.selectedAnswer,
    selectedAnswers: request.selectedAnswers,
  });
  if (!snapshot) throw new NotFoundError("Question not found.");

  // Display-order integrity: a shuffled session is fine; substituted option
  // text is rejected outright.
  const displayOrderIds = request.displayOptions
    ? verifyDisplayOptions(snapshot, request.displayOptions)
    : snapshot.options.map((o) => o.id);

  const selectionLimitations = [...snapshot.selectionIssues];
  if (
    request.selectedOptionId &&
    !displayOrderIds.includes(request.selectedOptionId) &&
    snapshot.options.some((o) => o.id === request.selectedOptionId)
  ) {
    selectionLimitations.push("selected-option-id-not-in-display-order");
  }

  let finding: VerificationFinding;
  let cacheHit = false;
  if (!snapshot.structurallyValid) {
    finding = malformedFinding(snapshot, selectionLimitations);
  } else {
    const verified = await verifyQuestion(snapshot, deps, request.enableSearch !== false);
    finding = verified.finding;
    cacheHit = verified.cacheHit;
  }

  // ── Audit stage: the key is read HERE, after the finding exists. ──
  const key = await (deps.loadKey ?? loadCanonicalAnswerKey)(snapshot.questionId);
  const audit = key
    ? auditDatabaseKey({
        snapshot,
        keyTexts: key.keyTexts,
        finding: {
          questionValidity: finding.questionValidity,
          established: finding.independentAnswer.established,
          acceptedOptionIds: finding.independentAnswer.acceptedOptionIds,
        },
      })
    : null;

  const databaseOptionIds = audit?.databaseOptionIds ?? [];
  const studentResult = originalStudentResult(snapshot.selectedOptionIds, databaseOptionIds);
  const counterfactual = independentStudentResult(
    snapshot.selectedOptionIds,
    finding.independentAnswer.acceptedOptionIds,
  );

  const corrected =
    finding.independentAnswer.established &&
    audit &&
    audit.status !== DatabaseAuditStatus.AGREES
      ? {
          established: true,
          acceptedOptionIds: finding.independentAnswer.acceptedOptionIds,
          answerText:
            snapshot.options
              .filter((o) => finding.independentAnswer.acceptedOptionIds.includes(o.id))
              .map((o) => o.text)
              .join(" | ")
              .slice(0, 4_000) || null,
        }
      : null;

  const metadata = {
    provider: finding.provider,
    model: finding.model,
    searchCalls: finding.searchCalls,
    llmCalls: finding.llmCalls,
    latencyMs: 0,
    cacheHit,
    solverPasses: finding.verifierAgreement === null ? 1 : 2,
    verifierAgreement: finding.verifierAgreement,
    contentHash: snapshot.contentHash,
    promptVersion: finding.promptVersion,
  };

  const result: MCQExplanation = {
    schemaVersion: EXPLAIN_SCHEMA_VERSION,
    policyVersion: EXPLAIN_POLICY_VERSION,
    questionId: snapshot.questionId,
    questionVersion: snapshot.questionVersion,
    verificationStatus: finding.verificationStatus,
    questionValidity: finding.questionValidity,
    independentAnswer: finding.independentAnswer,
    acceptedOptionIds: finding.independentAnswer.acceptedOptionIds,
    optionsAnalysis: finding.optionsAnalysis,
    selectedOptionId:
      snapshot.selectedOptionIds.length === 1 ? snapshot.selectedOptionIds[0] : null,
    selectedOptionIds: snapshot.selectedOptionIds,
    studentResult,
    studentResultBasis: "DATABASE_KEY",
    independentStudentResult: counterfactual,
    correctedAnswer: corrected,
    ambiguityOrDefect: finding.ambiguityOrDefect,
    invalidInput: finding.invalidInput,
    coreConcept: finding.coreConcept,
    solutionSteps: finding.solutionSteps,
    fastSolvingMethod: finding.fastSolvingMethod,
    evidence: finding.evidence,
    databaseAuditStatus: audit?.status ?? DatabaseAuditStatus.NOT_AUDITED,
    databaseAudit: audit?.audit ?? null,
    limitations: finding.limitations,
    generatedAt: (deps.now?.() ?? new Date()).toISOString(),
    metadata: { ...metadata, latencyMs: Date.now() - started },
  };

  // Strict server-side validation before anything is returned or persisted.
  const validated = MCQExplanationSchema.parse(result);

  // Persist the audit finding separately from canonical content. Best-effort,
  // never throws, and never contains the key text itself.
  if (audit) {
    (deps.persistAudit ?? auditLog)({
      userId,
      action: "mcq_verification_audit",
      resource: `question:${snapshot.questionId}`,
      details: {
        questionId: snapshot.questionId,
        questionVersion: snapshot.questionVersion,
        policyVersion: EXPLAIN_POLICY_VERSION,
        schemaVersion: EXPLAIN_SCHEMA_VERSION,
        verificationStatus: finding.verificationStatus,
        questionValidity: finding.questionValidity,
        databaseAuditStatus: audit.status,
        findings: audit.audit.findings,
        databaseOptionIds: audit.databaseOptionIds,
        keyHash: sha256Hex(key?.keyTexts ?? []),
        reviewStatus: audit.audit.reviewStatus,
        evidenceIds: finding.evidence.records.map((r) => r.id),
        verifierAgreement: finding.verifierAgreement,
        provider: finding.provider,
        model: finding.model,
      },
    });
  }

  return validated;
}

export async function generateIndependentExplanation(
  userId: string,
  request: ExplainV2Request,
  deps: ExplainDeps = {},
): Promise<MCQExplanation> {
  const key = [
    "explain-v2",
    String(request.questionId),
    request.selectedAnswer ?? "",
    request.selectedAnswers?.join("\u0001") ?? "",
    request.selectedOptionId ?? "",
    request.selectedOptionIds?.join("\u0001") ?? "",
    request.enableSearch === false ? "nosearch" : "search",
  ].join("|");
  return deduplicate(userId, "explain-v2", key, () => buildResult(userId, request, deps));
}

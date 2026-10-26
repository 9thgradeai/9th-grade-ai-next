// Stage D — database answer-key audit.
//
// Runs ONLY after the independent finding exists. Compares the stored key
// against that finding; it never feeds the key back into the solver and never
// mutates the canonical question or a completed attempt.

import "server-only";

import { normalizeOptionIdentity } from "../text";
import type { CanonicalSnapshot } from "../canonical-snapshot";
import {
  DatabaseAuditStatus,
  type DatabaseAudit,
  type QuestionValidity,
} from "../schema/types";

export type AuditFinding = {
  questionValidity: QuestionValidity;
  established: boolean;
  acceptedOptionIds: string[];
};

export type DatabaseAuditResult = {
  status: DatabaseAuditStatus;
  audit: DatabaseAudit;
  /** Mapped option IDs for the stored key (empty when unmappable). */
  databaseOptionIds: string[];
  unmappedKeyTexts: string[];
};

const LETTER_KEY = /^\(?([A-J])\)?[.)]?$/i;
const INDEX_KEY = /^(\d{1,2})$/;

/** Map stored key text to canonical option IDs without guessing. */
export function mapKeyTextsToOptionIds(
  keyTexts: readonly string[],
  snapshot: CanonicalSnapshot,
): { ids: string[]; unmapped: string[] } {
  const ids: string[] = [];
  const unmapped: string[] = [];

  for (const raw of keyTexts) {
    if (!raw || !raw.trim()) continue;
    const text = normalizeOptionIdentity(raw);

    const byText = snapshot.options.filter(
      (o) => normalizeOptionIdentity(o.text) === text,
    );
    if (byText.length === 1) {
      ids.push(byText[0].id);
      continue;
    }

    // Fall back to an explicit label or authored index only when no option
    // text matched (so a numeric option "2" wins over index 2).
    const letter = LETTER_KEY.exec(text);
    if (letter) {
      const index = letter[1].toUpperCase().charCodeAt(0) - 65;
      const option = snapshot.options.find((o) => o.authoredIndex === index);
      if (option) {
        ids.push(option.id);
        continue;
      }
    }
    const numeric = INDEX_KEY.exec(text);
    if (numeric) {
      const index = Number(numeric[1]);
      const option = snapshot.options.find((o) => o.authoredIndex === index);
      if (option) {
        ids.push(option.id);
        continue;
      }
    }

    unmapped.push(raw.slice(0, 200));
  }

  return { ids: Array.from(new Set(ids)), unmapped };
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const A = new Set(a);
  const B = new Set(b);
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

export function auditDatabaseKey(params: {
  snapshot: CanonicalSnapshot;
  keyTexts: readonly string[];
  finding: AuditFinding;
}): DatabaseAuditResult {
  const { snapshot, keyTexts, finding } = params;
  const mapped = mapKeyTextsToOptionIds(keyTexts, snapshot);
  const databaseOptionIds = mapped.ids;
  const accepted = finding.acceptedOptionIds;

  const keyMismatch =
    finding.established &&
    (databaseOptionIds.length === 0 || !sameSet(databaseOptionIds, accepted));
  const invalidQuestion =
    finding.questionValidity === "NO_CORRECT_OPTION" ||
    finding.questionValidity === "INCOMPLETE_OR_MALFORMED" ||
    !snapshot.structurallyValid;
  const multipleAnswers = finding.questionValidity === "VALID_MULTIPLE_ANSWERS";
  const ambiguous = finding.questionValidity === "AMBIGUOUS";
  const contextOrDateMismatch = finding.questionValidity === "OUTDATED_OR_CONTEXT_DEPENDENT";
  const inconclusive = !finding.established && !invalidQuestion;

  let status: DatabaseAuditStatus;
  if (invalidQuestion) {
    status = DatabaseAuditStatus.INVALID_QUESTION;
  } else if (ambiguous) {
    status = DatabaseAuditStatus.AMBIGUOUS_QUESTION;
  } else if (contextOrDateMismatch) {
    status = DatabaseAuditStatus.CONTEXT_OR_DATE_MISMATCH;
  } else if (inconclusive) {
    status = DatabaseAuditStatus.INCONCLUSIVE;
  } else if (multipleAnswers) {
    status = DatabaseAuditStatus.MULTIPLE_ANSWERS;
  } else if (keyMismatch) {
    status = DatabaseAuditStatus.KEY_MISMATCH;
  } else {
    status = DatabaseAuditStatus.AGREES;
  }

  const agrees = status === DatabaseAuditStatus.AGREES;
  const showKey = status !== DatabaseAuditStatus.AGREES;

  const discrepancyExplanation = (() => {
    switch (status) {
      case DatabaseAuditStatus.AGREES:
        return null;
      case DatabaseAuditStatus.KEY_MISMATCH:
        return mapped.unmapped.length > 0
          ? "The stored key could not be mapped to any original option, so it cannot be correct for this question as rendered."
          : "The stored key differs from the independently supported option(s). The stored key is retained unchanged pending human review.";
      case DatabaseAuditStatus.INVALID_QUESTION:
        return "Independent analysis indicates the question is defective (no correct option, malformed, or structurally invalid). The stored key requires review.";
      case DatabaseAuditStatus.MULTIPLE_ANSWERS:
        return "Independent analysis supports more than one option. If the exam format is single-answer, the question is defective.";
      case DatabaseAuditStatus.AMBIGUOUS_QUESTION:
        return "The wording admits competing reasonable interpretations; a unique key cannot be defended without clarification.";
      case DatabaseAuditStatus.CONTEXT_OR_DATE_MISMATCH:
        return "The defensible answer depends on the applicable date, jurisdiction, or version stated by the question.";
      case DatabaseAuditStatus.INCONCLUSIVE:
        return "Independent verification was inconclusive, so no claim is made about the stored key.";
      default:
        return null;
    }
  })();

  return {
    status,
    audit: {
      agreedWithDatabase: agrees,
      databaseOptionIds,
      databaseKeyText: showKey && keyTexts.length > 0 ? keyTexts.join(" | ").slice(0, 2_000) : null,
      discrepancyExplanation,
      findings: {
        keyMismatch,
        invalidQuestion,
        multipleAnswers,
        ambiguous,
        contextOrDateMismatch,
        inconclusive,
      },
      reviewStatus:
        status === DatabaseAuditStatus.AGREES
          ? "NOT_REQUIRED"
          : "PENDING_REVIEW",
    },
    databaseOptionIds,
    unmappedKeyTexts: mapped.unmapped,
  };
}

/**
 * Original student result under the STORED key. This is the historically
 * scored result and must never be replaced by the independent finding.
 */
export function originalStudentResult(
  selectedOptionIds: readonly string[],
  databaseOptionIds: readonly string[],
): "CORRECT" | "INCORRECT" | "UNANSWERED" | "NOT_SCORED" {
  if (selectedOptionIds.length === 0) return "UNANSWERED";
  if (databaseOptionIds.length === 0) return "NOT_SCORED";
  // All-or-nothing set equality matches the exam engine's grading rule.
  return sameSet(selectedOptionIds, databaseOptionIds) ? "CORRECT" : "INCORRECT";
}

/** Counterfactual result if the independent finding were applied. */
export function independentStudentResult(
  selectedOptionIds: readonly string[],
  acceptedOptionIds: readonly string[],
): "CORRECT" | "INCORRECT" | "UNANSWERED" | "NOT_SCORED" | null {
  if (selectedOptionIds.length === 0) return "UNANSWERED";
  if (acceptedOptionIds.length === 0) return null;
  return sameSet(selectedOptionIds, acceptedOptionIds) ? "CORRECT" : "INCORRECT";
}

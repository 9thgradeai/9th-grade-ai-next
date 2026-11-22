// backend/services/adaptive-exam/question-validation.ts
// Module 8d of Adaptive Exam V2.0: QuestionValidationService.
//
// Structural validation only; never bypasses validation. repair() is bounded
// and may return null (caller must then reject the paper).

import "server-only";

import type {
  CandidatePaperQuestion,
  ExamBlueprint,
  QuestionValidationService,
  ValidationFinding,
} from "./contracts";

function push(findings: ValidationFinding[], severity: ValidationFinding["severity"], rule: string, message: string, path: string) {
  findings.push({ rule, severity, message, path });
}

function validateOne(question: CandidatePaperQuestion, blueprint: ExamBlueprint): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const path = `questions[${question.position}]`;

  if (!question.questionText || question.questionText.trim().length === 0) {
    push(findings, "error", "EMPTY_TEXT", "Question text is empty.", `${path}.questionText`);
  }
  const optionKeys = ["A", "B", "C", "D"] as const;
  for (const key of optionKeys) {
    if (!question.options[key] || question.options[key].trim().length === 0) {
      push(findings, "error", "EMPTY_OPTION", `Option ${key} is empty.`, `${path}.options.${key}`);
    }
  }
  if (new Set(Object.values(question.options)).size < 4) {
    push(findings, "warning", "DUPLICATE_OPTIONS", "Options are not all distinct.", `${path}.options`);
  }
  if (!question.subjectId) {
    push(findings, "error", "MISSING_SUBJECT", "Subject id is missing.", `${path}.subjectId`);
  }
  if (!question.topicPath) {
    push(findings, "error", "MISSING_TOPIC", "Topic path is missing.", `${path}.topicPath`);
  }
  if (!["EASY", "MEDIUM", "HARD"].includes(question.difficulty)) {
    push(findings, "error", "INVALID_DIFFICULTY", "Invalid difficulty band.", `${path}.difficulty`);
  }
  if (question.provenance.sourceType.trim().length === 0) {
    push(findings, "error", "MISSING_PROVENANCE", "Provenance is missing.", `${path}.provenance`);
  }

  // Blueprint conformance: subject must exist in blueprint.
  const subject = blueprint.allocations.find((item) => item.subjectId === question.subjectId);
  if (!subject) {
    push(findings, "error", "SUBJECT_NOT_IN_BLUEPRINT", "Question subject is not in the blueprint.", `${path}.subjectId`);
  } else {
    const topic = subject.topics.find((item) => item.topicId === question.topicPath || item.paths.includes(question.topicPath));
    if (!topic) {
      push(findings, "warning", "TOPIC_NOT_IN_BLUEPRINT", "Question topic is not explicitly allocated.", `${path}.topicPath`);
    }
  }

  return findings;
}

export function createQuestionValidationService(options: { clock?: { now(): string } } = {}): QuestionValidationService {
  const now = () => (options.clock ? options.clock.now() : new Date().toISOString());
  return {
    async validateQuestion(question, blueprint) {
      const findings = validateOne(question, blueprint);
      const errors = findings.filter((finding) => finding.severity === "error" || finding.severity === "critical");
      return {
        target: { kind: "question", id: question.questionId ?? `pos-${question.position}` },
        outcome: errors.length > 0 ? "REJECTED" : findings.length > 0 ? "PASS_WITH_WARNING" : "PASS",
        findings,
        checkedAt: now(),
        validatorVersion: "v1",
      };
    },

    async validatePaper(questions, blueprint) {
      const findings: ValidationFinding[] = [];
      // Count conformance.
      if (questions.length !== blueprint.totalQuestionCount) {
        push(findings, "warning", "COUNT_MISMATCH", `Paper has ${questions.length} questions, blueprint expects ${blueprint.totalQuestionCount}.`, "paper.count");
      }
      // Duplicate question text.
      const textSet = new Set<string>();
      for (const question of questions) {
        if (textSet.has(question.questionText)) {
          push(findings, "warning", "DUPLICATE_QUESTION", "Duplicate question text in paper.", `questions[${question.position}].questionText`);
        }
        textSet.add(question.questionText);
      }
      // Per-question validation.
      for (const question of questions) {
        findings.push(...validateOne(question, blueprint));
      }
      const errors = findings.filter((finding) => finding.severity === "error" || finding.severity === "critical");
      const warnings = findings.filter((finding) => finding.severity === "warning" || finding.severity === "info");
      const outcome = errors.length > 0
        ? "REJECTED"
        : warnings.length > 0
          ? "PASS_WITH_WARNING"
          : "PASS";
      return {
        target: { kind: "paper", id: "paper" },
        outcome,
        findings,
        checkedAt: now(),
        validatorVersion: "v1",
      };
    },

    async repair(question, report, attempt) {
      // Bounded repair: only whitespace/empty cleanup; never fabricates content.
      if (attempt > 2) return null;
      const repaired: CandidatePaperQuestion = { ...question };
      if (!repaired.questionText) return null;
      repaired.questionText = repaired.questionText.trim();
      for (const key of ["A", "B", "C", "D"] as const) {
        repaired.options = { ...repaired.options, [key]: (repaired.options[key] || "").trim() };
      }
      // If any option is still empty, repair cannot fix it.
      if (["A", "B", "C", "D"].some((key) => !repaired.options[key as "A"])) return null;
      return repaired;
    },
  };
}

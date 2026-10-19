// backend/services/exam-config/validate.ts — configuration integrity checks.
//
// Runs BEFORE any paper assembly. An invalid configuration is rejected so a
// malformed paper can never be presented as an official exam.
//
// Checks (master spec §3 "Configuration validation"):
//   • exam total equals the sum of subject marks
//   • parent-child mark totals agree wherever BOTH are explicitly present
//   • duplicate node ids anywhere in the config
//   • orphaned nodes: a leaf with no paths and no children
//   • non-positive / non-finite marks, negative weights, invalid quotas
//   • inconsistent scoring policy
//   • inferred nodes never carry official marks (provenance discipline)

import type {
  ExamConfig,
  SubjectNode,
  TopicNode,
  ValidationIssue,
  ValidationResult,
} from "./types";

const EPSILON = 1e-9;

function visit(node: TopicNode, path: string, issues: ValidationIssue[]): void {
  if (!node.id || typeof node.id !== "string") {
    issues.push({ severity: "error", code: "TOPIC_ID_MISSING", message: "Topic node is missing an id.", path });
  }
  if (!Array.isArray(node.paths)) {
    issues.push({ severity: "error", code: "TOPIC_PATHS_INVALID", message: `Node "${node.id}" paths must be an array.`, path });
  }
  if (node.children.length === 0 && node.paths.length === 0) {
    issues.push({
      severity: "error",
      code: "TOPIC_ORPHAN",
      message: `Leaf topic "${node.id}" has no paths — it can never match a question.`,
      path,
    });
  }
  if (node.marks !== undefined) {
    if (!Number.isFinite(node.marks) || node.marks <= 0) {
      issues.push({ severity: "error", code: "TOPIC_MARKS_INVALID", message: `Node "${node.id}" has a non-positive mark value.`, path });
    }
    if (node.allocationSource === "inferred") {
      issues.push({
        severity: "error",
        code: "INFERRED_MARKS_PRESENT",
        message: `Node "${node.id}" is marked inferred but carries marks — inferred allocations must never be presented as official.`,
        path,
      });
    }
  }
  if (node.weight !== undefined && (!Number.isFinite(node.weight) || node.weight < 0)) {
    issues.push({ severity: "error", code: "WEIGHT_INVALID", message: `Node "${node.id}" has an invalid weight.`, path });
  }
  for (const key of ["minQuota", "maxQuota"] as const) {
    const v = node[key];
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) {
      issues.push({ severity: "error", code: "QUOTA_INVALID", message: `Node "${node.id}" has an invalid ${key}.`, path });
    }
  }
  if (
    node.minQuota !== undefined &&
    node.maxQuota !== undefined &&
    node.minQuota > node.maxQuota
  ) {
    issues.push({ severity: "error", code: "QUOTA_RANGE_INVALID", message: `Node "${node.id}" minQuota exceeds maxQuota.`, path });
  }

  // Parent-child mark agreement (only when BOTH levels declare marks).
  const childMarks = node.children
    .map((c) => c.marks)
    .filter((m): m is number => m !== undefined);
  if (node.marks !== undefined && childMarks.length === node.children.length && node.children.length > 0) {
    const sum = childMarks.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - node.marks) > EPSILON) {
      issues.push({
        severity: "error",
        code: "PARENT_CHILD_MARKS_MISMATCH",
        message: `Node "${node.id}" declares ${node.marks} marks but its children sum to ${sum}.`,
        path,
      });
    }
  }

  for (const child of node.children) {
    visit(child, `${path}.${child.id}`, issues);
  }
}

export function validateExamConfig(config: ExamConfig): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();

  if (!config || typeof config !== "object") {
    return { valid: false, issues: [{ severity: "error", code: "CONFIG_INVALID", message: "Configuration is not an object." }] };
  }
  if (!Number.isInteger(config.version) || config.version < 1) {
    issues.push({ severity: "error", code: "VERSION_INVALID", message: "Config version must be a positive integer." });
  }
  if (!Array.isArray(config.subjects) || config.subjects.length === 0) {
    issues.push({ severity: "error", code: "SUBJECTS_EMPTY", message: "Configuration must declare at least one subject." });
    return { valid: false, issues };
  }

  // Scoring policy.
  const s = config.scoring;
  if (!s || !Number.isFinite(s.marksPerQuestion) || s.marksPerQuestion <= 0) {
    issues.push({ severity: "error", code: "SCORING_INVALID", message: "marksPerQuestion must be a positive number." });
  }
  if (!s || !Number.isFinite(s.penaltyPerWrong) || s.penaltyPerWrong < 0) {
    issues.push({ severity: "error", code: "SCORING_INVALID", message: "penaltyPerWrong must be a non-negative number." });
  }
  if (!s || !Number.isFinite(s.marksForUnanswered)) {
    issues.push({ severity: "error", code: "SCORING_INVALID", message: "marksForUnanswered must be a number." });
  }

  const subjectMarks: number[] = [];
  for (const subject of config.subjects) {
    const subjectPath = subject.id;
    if (seenIds.has(subject.id)) {
      issues.push({ severity: "error", code: "DUPLICATE_ID", message: `Duplicate subject id "${subject.id}".`, path: subjectPath });
    }
    seenIds.add(subject.id);
    if (!Number.isFinite(subject.marks) || subject.marks <= 0) {
      issues.push({ severity: "error", code: "SUBJECT_MARKS_INVALID", message: `Subject "${subject.id}" has a non-positive mark value.`, path: subjectPath });
    }
    if (!subject.rootSegment) {
      issues.push({ severity: "error", code: "SUBJECT_ROOT_MISSING", message: `Subject "${subject.id}" must declare a rootSegment.`, path: subjectPath });
    }
    subjectMarks.push(subject.marks);

    // Subject-level total vs children (only when every child declares marks).
    const childMarks = subject.children
      .map((c) => c.marks)
      .filter((m): m is number => m !== undefined);
    if (subject.children.length > 0 && childMarks.length === subject.children.length) {
      const sum = childMarks.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - subject.marks) > EPSILON) {
        issues.push({
          severity: "error",
          code: "SUBJECT_CHILD_MARKS_MISMATCH",
          message: `Subject "${subject.id}" declares ${subject.marks} marks but its topics sum to ${sum}.`,
          path: subjectPath,
        });
      }
    }

    for (const child of subject.children) {
      visit(child, `${subjectPath}.${child.id}`, issues);
      collectIds(child, subjectPath, seenIds, issues);
    }
  }

  const subjectTotal = subjectMarks.reduce((a, b) => a + b, 0);
  if (Math.abs(subjectTotal - config.totalMarks) > EPSILON) {
    issues.push({
      severity: "error",
      code: "EXAM_TOTAL_MISMATCH",
      message: `Exam total is ${config.totalMarks} but subject marks sum to ${subjectTotal}.`,
    });
  }
  if (config.totalQuestions !== config.totalMarks) {
    issues.push({
      severity: "warning",
      code: "TOTAL_QUESTIONS_MARKS_DIVERGENCE",
      message: `totalQuestions (${config.totalQuestions}) differs from totalMarks (${config.totalMarks}); both exams use 1 mark/question.`,
    });
  }

  return { valid: !issues.some((i) => i.severity === "error"), issues };
}

function collectIds(
  node: TopicNode,
  subjectPath: string,
  seenIds: Set<string>,
  issues: ValidationIssue[],
): void {
  if (seenIds.has(node.id)) {
    issues.push({
      severity: "error",
      code: "DUPLICATE_ID",
      message: `Duplicate topic id "${node.id}".`,
      path: `${subjectPath}.${node.id}`,
    });
  }
  seenIds.add(node.id);
  for (const child of node.children) collectIds(child, subjectPath, seenIds, issues);
}

/** Test/ops helper: flatten every node id in a config (subjects included). */
export function collectConfigIds(config: ExamConfig): string[] {
  const ids: string[] = [];
  const walk = (node: TopicNode) => {
    ids.push(node.id);
    node.children.forEach(walk);
  };
  for (const subject of config.subjects) {
    ids.push(subject.id);
    subject.children.forEach(walk);
  }
  return ids;
}

/** Test/ops helper: every path prefix declared anywhere in a subject tree. */
export function subjectPaths(subject: SubjectNode): string[] {
  const out: string[] = [];
  const walk = (node: TopicNode) => {
    out.push(...node.paths);
    node.children.forEach(walk);
  };
  subject.children.forEach(walk);
  return out;
}

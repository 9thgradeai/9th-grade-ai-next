// backend/services/exam-config/allocation.ts — deterministic allocation engine.
//
// Pure, UI-free, DB-free. Takes a materialised allocation scope (config +
// selection + eligible inventory counts) and returns a full allocation plan
// with structured diagnostics. The same inputs always produce the same plan.
//
// Precedence (master spec §5):
//   1. Explicit official marks (hard quotas for a full paper).
//   2. Configured weights (`node.weight`).
//   3. Documented neutral fallback — an even split among eligible nodes, capped
//      by inventory. Raw question counts are NEVER used as the sole weight.
//
// Rounding is largest-remainder, so integer allocations always sum to the
// requested total when the inventory can support it.
//
// Deficit handling: a deficit is redistributed only among nodes with remaining
// headroom INSIDE the permitted scope. SUBJECT quotas are hard for a full paper
// and are never silently relaxed — an unmet subject quota yields `infeasible`
// with a diagnostic naming the subject, requested, achievable and deficit.
// TOPIC sub-quotas are guidance: the subject total is preserved by
// redistribution across the subject's eligible leaves, and any unmet sub-quota
// is disclosed as an `OFFICIAL_TOPIC_QUOTA_SHORTFALL` warning that drives a
// `redistributed` outcome (a buildable paper is not blocked). Custom (practice)
// papers may disclose total deviations when their policy permits.

import type {
  AllocatedSubject,
  AllocatedTopic,
  AllocationDiagnostic,
  AllocationOutcome,
  AllocationResult,
  ExamEcosystemCode,
  ExamMode,
  ScopeNode,
  ScopeSubject,
  ScoringPolicy,
} from "./types";

// ── Numeric helpers ────────────────────────────────────────

/** Largest-remainder rounding of arbitrary non-negative weights into `total` ints. */
export function largestRemainder(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    // Neutral fallback: even split, remainder to the earliest indices.
    const base = Math.floor(total / n);
    let rem = total - base * n;
    return weights.map(() => {
      const v = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      return v;
    });
  }
  const raw = weights.map((w) => (w * total) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => (b.frac - a.frac) || (a.i - b.i));
  const out = floors.slice();
  for (const { i } of order) {
    if (remainder <= 0) break;
    out[i] += 1;
    remainder -= 1;
  }
  return out;
}

type WeightedItem = { weight: number; capacity: number };

/**
 * Distribute `total` across items by weight, capped by capacity, using
 * deterministic iterative largest-remainder. Returns non-negative integers
 * that sum to min(total, sum(capacity)).
 */
export function distributeWeighted(total: number, items: WeightedItem[]): number[] {
  const n = items.length;
  const alloc = new Array<number>(n).fill(0);
  if (n === 0 || total <= 0) return alloc;

  let remaining = Math.max(0, Math.floor(total));
  // Bound iterations defensively; each productive pass reduces `remaining`.
  let guard = remaining + n + 8;
  while (remaining > 0 && guard-- > 0) {
    const eligible: number[] = [];
    for (let i = 0; i < n; i++) {
      if (alloc[i] < items[i].capacity) eligible.push(i);
    }
    if (eligible.length === 0) break;

    const wsum = eligible.reduce((a, i) => a + Math.max(0, items[i].weight), 0);
    let distributed = 0;

    if (wsum <= 0) {
      // Neutral even split among eligible (documented fallback).
      const per = Math.floor(remaining / eligible.length);
      const extra = remaining % eligible.length;
      eligible.forEach((i, idx) => {
        const want = per + (idx < extra ? 1 : 0);
        const can = Math.min(want, items[i].capacity - alloc[i]);
        alloc[i] += can;
        distributed += can;
      });
    } else {
      const weights = eligible.map((i) => Math.max(0, items[i].weight));
      const targets = largestRemainder(remaining, weights);
      eligible.forEach((i, idx) => {
        const can = Math.min(targets[idx], items[i].capacity - alloc[i]);
        alloc[i] += can;
        distributed += can;
      });
    }

    if (distributed <= 0) break;
    remaining -= distributed;
  }
  return alloc;
}

/** Natural weight of a node: official marks, else configured weight, else neutral. */
function nodeWeight(node: ScopeNode): number {
  if (node.marks !== undefined) return Math.max(0, node.marks);
  if (node.weight !== undefined) return Math.max(0, node.weight);
  return 1; // neutral
}

// ── Within-subject allocation ──────────────────────────────

type NodeAllocation = {
  allocated: number;
  topics: AllocatedTopic[];
  /** Official nodes whose marks could not be met (full paper hard constraints). */
  shortfalls: Array<{ node: ScopeNode; requested: number; achievable: number }>;
};

function allocateNode(target: number, node: ScopeNode): NodeAllocation {
  if (node.children.length === 0) {
    const allocated = Math.min(target, node.capacity);
    return {
      allocated,
      topics: [
        {
          id: node.id,
          nameBn: node.nameBn,
          allocated,
          capacity: node.capacity,
          source: node.allocationSource,
          children: [],
        },
      ],
      shortfalls: [],
    };
  }

  const items: WeightedItem[] = node.children.map((c) => ({
    weight: nodeWeight(c),
    capacity: c.capacity,
  }));
  const childAlloc = distributeWeighted(target, items);

  const shortfalls: NodeAllocation["shortfalls"] = [];
  const topics: AllocatedTopic[] = [];
  let allocated = 0;

  node.children.forEach((child, i) => {
    const sub = allocateNode(childAlloc[i], child);
    topics.push({
      id: child.id,
      nameBn: child.nameBn,
      allocated: sub.allocated,
      capacity: child.capacity,
      source: child.allocationSource,
      children: sub.topics,
    });
    allocated += sub.allocated;
    shortfalls.push(...sub.shortfalls);
    if (child.marks !== undefined && child.marks > sub.allocated) {
      shortfalls.push({ node: child, requested: child.marks, achievable: sub.allocated });
    }
  });

  return { allocated, topics, shortfalls };
}

// ── Public API ─────────────────────────────────────────────

export type AllocationInput = {
  examCode: ExamEcosystemCode;
  configVersion: number;
  scoring: ScoringPolicy;
  mode: ExamMode;
  subjects: ScopeSubject[];
  /** Requested total questions. Ignored (set from marks) when `fullPaper`. */
  requested?: number;
  /** Real/mock full paper: subject quotas are the official marks (hard). */
  fullPaper: boolean;
  /** Explicit per-subject counts (custom). Overrides proportional scaling. */
  perSubject?: Record<string, number>;
  /** Practice policy may disclose deviations instead of failing. */
  allowDeviations?: boolean;
};

export function allocateScope(input: AllocationInput): AllocationResult {
  const { examCode, configVersion, scoring, mode, subjects, fullPaper } = input;
  const diagnostics: AllocationDiagnostic[] = [];

  if (!subjects || subjects.length === 0) {
    return {
      outcome: "invalid",
      examCode,
      configVersion,
      scoring,
      mode,
      requested: 0,
      achievable: 0,
      subjects: [],
      diagnostics: [
        { code: "SCOPE_EMPTY", severity: "error", message: "No subjects remain in the selection scope." },
      ],
    };
  }

  const fullTotal = subjects.reduce((a, s) => a + (s.marks > 0 ? s.marks : 0), 0);
  const requested = fullPaper
    ? fullTotal
    : Math.max(0, Math.floor(input.requested ?? 0));

  // Target questions per subject.
  let subjectTargets: number[];
  if (fullPaper) {
    subjectTargets = subjects.map((s) => (s.marks > 0 ? s.marks : 0));
  } else if (input.perSubject && Object.keys(input.perSubject).length > 0) {
    subjectTargets = subjects.map((s) => Math.max(0, Math.floor(input.perSubject?.[s.id] ?? 0)));
  } else {
    // Proportional to official marks, capped by inventory, redistributing any
    // deficit across subjects with headroom (custom policy).
    const items: WeightedItem[] = subjects.map((s) => ({
      weight: s.marks > 0 ? s.marks : 0,
      capacity: s.capacity,
    }));
    subjectTargets = distributeWeighted(requested, items);
  }

  const allocatedSubjects: AllocatedSubject[] = [];
  let totalAllocated = 0;

  subjects.forEach((subject, i) => {
    const target = subjectTargets[i];
    const result = allocateNode(target, {
      id: subject.id,
      nameBn: subject.nameBn,
      nameEn: subject.nameEn,
      marks: subject.marks,
      allocationSource: subject.allocationSource,
      capacity: subject.capacity,
      children: subject.children,
    });
    totalAllocated += result.allocated;
    if (fullPaper && result.allocated < target) {
      diagnostics.push({
        code: "SUBJECT_QUOTA_SHORTFALL",
        severity: "error",
        message: `Subject "${subject.nameBn}" requires ${target} questions but only ${result.allocated} are eligible.`,
        subjectId: subject.id,
        requested: target,
        achievable: result.allocated,
        deficit: target - result.allocated,
      });
    }
    for (const short of result.shortfalls) {
      // Topic sub-quotas are guidance, not hard constraints: the SUBJECT total
      // is preserved by redistribution across the subject's eligible leaves. An
      // unmet topic quota is disclosed (and drives a `redistributed` outcome)
      // but does not, on its own, make a buildable paper infeasible.
      diagnostics.push({
        code: "OFFICIAL_TOPIC_QUOTA_SHORTFALL",
        severity: "warning",
        message: `Topic "${short.node.nameBn}" requires ${short.requested} but only ${short.achievable} are eligible; the remainder was redistributed within "${subject.nameBn}".`,
        subjectId: subject.id,
        topicId: short.node.id,
        requested: short.requested,
        achievable: short.achievable,
        deficit: short.requested - short.achievable,
      });
    }
    allocatedSubjects.push({
      id: subject.id,
      nameBn: subject.nameBn,
      nameEn: subject.nameEn,
      requested: target,
      allocated: result.allocated,
      capacity: subject.capacity,
      source: subject.allocationSource,
      mandatory: fullPaper,
      topics: result.topics,
    });
  });
  // Derive redistribution from the finished plan (the forEach callback above
  // mutates over the array; a plain flag inside it defeats control-flow
  // analysis, hence the explicit re-derivation).
  const sawSubjectRedistribution = allocatedSubjects.some(
    (s) => s.allocated !== s.requested,
  );
  const sawTopicRedistribution = diagnostics.some(
    (d) => d.code === "OFFICIAL_TOPIC_QUOTA_SHORTFALL",
  );

  const achievable = totalAllocated;
  const hardFailure =
    fullPaper &&
    (achievable < requested || diagnostics.some((d) => d.severity === "error"));

  let outcome: AllocationOutcome;
  if (hardFailure) {
    outcome = "infeasible";
  } else if (!fullPaper && achievable < requested) {
    // Practice/custom policy may disclose deviations.
    outcome = input.allowDeviations ? "deviations" : "infeasible";
    if (outcome === "deviations") {
      diagnostics.push({
        code: "CUSTOM_DEVIATION",
        severity: "warning",
        message: `Requested ${requested} questions but only ${achievable} are eligible in the selected scope.`,
        requested,
        achievable,
        deficit: requested - achievable,
      });
    }
  } else if (sawSubjectRedistribution || sawTopicRedistribution) {
    outcome = "redistributed";
  } else {
    outcome = "feasible";
  }

  return {
    outcome,
    examCode,
    configVersion,
    scoring,
    mode,
    requested,
    achievable,
    subjects: allocatedSubjects,
    diagnostics,
  };
}

/** Recursively count allocated questions (hooks live in snapshots/metrics). */
export function sumAllocated(result: AllocationResult): number {
  return result.subjects.reduce((a, s) => a + s.allocated, 0);
}

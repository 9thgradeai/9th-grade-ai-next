// backend/services/exam-inventory.ts — read-only inventory & scope materialisation.
//
// Answers one question, authoritatively and cheaply: "for this exam
// configuration, how many ELIGIBLE questions actually exist per subject and per
// configured topic right now?" The allocation engine is pure and takes
// capacities as input; this file is the only place that reads the database to
// produce those capacities.
//
// Eligibility rules (master spec §4):
//   • A config node covers a question when the question's absolute `path` equals
//     one of the node's prefixes or is nested below it (`prefix + "/"`).
//   • A config subject binds to a DB `Subject` row by exact `nameBn`
//     (`matchNameBn` first, then `rootSegment` — Bank subjects are named by the
//     taxonomy root segment).
//   • Bangla is a SHARED pool: a Bangla config subject also sees sibling Bangla
//     subjects from the other ecosystem, matched by taxonomy-relative suffix
//     (reusing backend/services/bangla-union.ts), so inventory never disagrees
//     with what the exam builder can actually serve.
//
// This module never writes. It is safe to call on every request.

import "server-only";

import { prisma } from "~backend/db";
import {
  getBanglaSubjects,
  isBanglaSubjectName,
  pathSuffix,
} from "~backend/services/bangla-union";
import {
  getExamConfig,
  getExamConfigValidation,
  type ExamConfig,
  type ExamEcosystemCode,
  type ScopeNode,
  type ScopeSelection,
  type ScopeSubject,
  type SubjectNode,
  type TopicNode,
} from "./exam-config";

// ── Raw inventory read ─────────────────────────────────────

export type SubjectQuestionRow = { subjectId: number; path: string; count: number };

export type EcosystemInventory = {
  ecosystemCode: ExamEcosystemCode;
  ecosystemId: number | null;
  /** DB subjects in this ecosystem, so the API can name a missing binding. */
  subjects: Array<{ id: number; nameBn: string }>;
  /** All (subjectId, path) question counts — Bangla siblings included for union. */
  rows: SubjectQuestionRow[];
};

/**
 * Load the question inventory needed to score any exam config against the
 * ecosystem. One `groupBy` over `Question`, plus the Bangla sibling set.
 */
export async function getEcosystemInventory(
  ecosystemCode: ExamEcosystemCode,
  ecosystemId: number | null,
): Promise<EcosystemInventory> {
  // The question groupBy is intentionally unscoped: Bangla subjects share a
  // pool across ecosystems, so sibling rows must be visible for capacity math.
  const [subjectRows, countRows] = await Promise.all([
    prisma.subject.findMany({
      where: ecosystemId ? { ecosystemId } : undefined,
      select: { id: true, nameBn: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.question.groupBy({ by: ["subjectId", "path"], _count: { _all: true } }),
  ]);

  const rows: SubjectQuestionRow[] = countRows.map((r) => ({
    subjectId: r.subjectId,
    path: r.path,
    count: r._count._all,
  }));

  return {
    ecosystemCode,
    ecosystemId,
    subjects: subjectRows.map((s) => ({ id: s.id, nameBn: s.nameBn })),
    rows,
  };
}

// ── Binding config subjects → DB subjects ──────────────────

/**
 * Resolve a config subject to its DB `Subject` row. `matchNameBn` (exact) is
 * the primary signal; `rootSegment` is the documented fallback because Bank
 * subjects use the taxonomy root segment as their `nameBn`.
 */
export function resolveDbSubjectId(
  subject: SubjectNode,
  dbSubjects: Array<{ id: number; nameBn: string }>,
): number | null {
  if (subject.matchNameBn) {
    const hit = dbSubjects.find((s) => s.nameBn === subject.matchNameBn);
    if (hit) return hit.id;
  }
  const byRoot = dbSubjects.find((s) => s.nameBn === subject.rootSegment);
  return byRoot?.id ?? null;
}

// ── Path matching ──────────────────────────────────────────

/** Absolute-prefix match: a question path is covered by any config prefix. */
export function pathMatchesPrefixes(path: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) return true; // whole subject
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Sibling (Bangla union) match: config prefixes compared by relative suffix. */
export function suffixMatchesPrefixes(
  path: string,
  prefixes: string[],
): boolean {
  if (prefixes.length === 0) return true;
  const leafSuffix = pathSuffix(path);
  if (!leafSuffix) return false;
  return prefixes
    .map(pathSuffix)
    .filter((s) => s.length > 0)
    .some((s) => leafSuffix === s || leafSuffix.startsWith(`${s}/`));
}

// ── Per-node / per-subject capacity ────────────────────────

export type LeafBinding = {
  configId: string;
  leaves: Array<{ subjectId: number; path: string; count: number }>;
  capacity: number;
};

type SubjectContext = {
  ownSubjectId: number | null;
  ownRows: SubjectQuestionRow[];
  siblingRows: Array<{ subjectId: number; path: string; count: number }>;
  isBangla: boolean;
};

function leavesForPrefixes(
  configId: string,
  prefixes: string[],
  ctx: SubjectContext,
): LeafBinding {
  // Aggregate by (subjectId, path): the inventory query is already grouped, but
  // collapsing here keeps the binding correct even if a caller hands us
  // ungrouped rows — a duplicated leaf must never be counted (or picked) twice.
  const byKey = new Map<string, { subjectId: number; path: string; count: number }>();
  const add = (subjectId: number, path: string, count: number) => {
    const key = `${subjectId}\u0000${path}`;
    const existing = byKey.get(key);
    if (existing) existing.count += count;
    else byKey.set(key, { subjectId, path, count });
  };

  if (ctx.ownSubjectId !== null) {
    for (const row of ctx.ownRows) {
      if (pathMatchesPrefixes(row.path, prefixes)) add(ctx.ownSubjectId, row.path, row.count);
    }
  }
  if (ctx.isBangla) {
    for (const row of ctx.siblingRows) {
      if (suffixMatchesPrefixes(row.path, prefixes)) add(row.subjectId, row.path, row.count);
    }
  }

  const leaves = [...byKey.values()];
  const capacity = leaves.reduce((a, l) => a + l.count, 0);
  return { configId, leaves, capacity };
}

/**
 * Build the scope node tree for a config node, applying the selection's topic
 * filter. `selected` (config node ids) — when non-empty, only selected subtrees
 * survive. Returns `null` when the node is filtered out entirely.
 */
function buildScopeNode(
  node: TopicNode,
  ctx: SubjectContext,
  selected: Set<string>,
  bindings: Map<string, LeafBinding>,
): ScopeNode | null {
  const selfSelected = selected.has(node.id);

  if (node.children.length === 0) {
    if (selected.size > 0 && !selfSelected) return null;
    const binding = leavesForPrefixes(node.id, node.paths, ctx);
    bindings.set(node.id, binding);
    return {
      id: node.id,
      nameBn: node.nameBn,
      nameEn: node.nameEn,
      marks: node.marks,
      allocationSource: node.allocationSource,
      weight: node.weight,
      minQuota: node.minQuota,
      maxQuota: node.maxQuota,
      mandatory: node.mandatory,
      capacity: binding.capacity,
      children: [],
    };
  }

  // A grouping node: keep children that survive the filter. When the node
  // itself is explicitly selected, keep ALL of its descendants.
  const childSelected = selfSelected ? new Set<string>() : selected;
  const children: ScopeNode[] = [];
  for (const child of node.children) {
    const built = buildScopeNode(child, ctx, childSelected, bindings);
    if (built) children.push(built);
  }
  if (children.length === 0) return null;

  const capacity = children.reduce((a, c) => a + c.capacity, 0);
  return {
    id: node.id,
    nameBn: node.nameBn,
    nameEn: node.nameEn,
    marks: node.marks,
    allocationSource: node.allocationSource,
    weight: node.weight,
    minQuota: node.minQuota,
    maxQuota: node.maxQuota,
    mandatory: node.mandatory,
    capacity,
    children,
  };
}

function subjectContext(
  subject: SubjectNode,
  dbSubjectId: number | null,
  inventory: EcosystemInventory,
  bangla: { ids: Set<number>; names: Map<number, string> } | null,
): SubjectContext {
  const ownRows = inventory.rows.filter((r) => r.subjectId === dbSubjectId);
  const isBangla =
    dbSubjectId !== null &&
    (bangla?.ids.has(dbSubjectId) ?? false) &&
    isBanglaSubjectName(bangla?.names.get(dbSubjectId));

  // Sibling Bangla rows: every other Bangla subject's leaves, matched by suffix.
  const siblingRows: SubjectContext["siblingRows"] = [];
  if (isBangla && bangla) {
    for (const sid of bangla.ids) {
      if (sid === dbSubjectId) continue;
      for (const row of inventory.rows) {
        if (row.subjectId === sid) siblingRows.push(row);
      }
    }
  }
  return { ownSubjectId: dbSubjectId, ownRows, siblingRows, isBangla };
}

export type MaterializedScope = {
  config: ExamConfig;
  examCode: ExamEcosystemCode;
  configVersion: number;
  subjects: ScopeSubject[];
  /** Leaf bindings keyed by config node id — the paper builder picks from these. */
  bindings: Map<string, LeafBinding>;
  /** Config subject id → resolved DB subject id (null when unbound). */
  dbSubjectByConfigId: Map<string, number | null>;
};

/**
 * Materialise a full allocation scope (config + selection + live inventory).
 * Pure with respect to `inventory` — the only side effect is the DB read done
 * by `getEcosystemInventory`.
 */
export function materializeScope(
  config: ExamConfig,
  inventory: EcosystemInventory,
  bangla: { ids: number[]; names: Map<number, string> } | null,
  selection?: ScopeSelection,
): MaterializedScope {
  const selectedSubjects = selection?.subjects;
  const selectedSubjectIds = new Set(
    (selectedSubjects ?? []).map((s) => s.subjectId),
  );
  const topicsBySubject = new Map<string, Set<string>>();
  for (const s of selectedSubjects ?? []) {
    topicsBySubject.set(s.subjectId, new Set(s.topics ?? []));
  }

  const dbIds = new Set<number>(bangla?.ids ?? []);
  const banglaCtx = bangla
    ? { ids: dbIds, names: bangla.names }
    : null;

  const subjects: ScopeSubject[] = [];
  const bindings = new Map<string, LeafBinding>();
  const dbSubjectByConfigId = new Map<string, number | null>();

  for (const subject of config.subjects) {
    if (selectedSubjects && selectedSubjects.length > 0 && !selectedSubjectIds.has(subject.id)) {
      continue;
    }
    const dbSubjectId = resolveDbSubjectId(subject, inventory.subjects);
    dbSubjectByConfigId.set(subject.id, dbSubjectId);
    const ctx = subjectContext(subject, dbSubjectId, inventory, banglaCtx);
    const selected = topicsBySubject.get(subject.id) ?? new Set<string>();

    const children: ScopeNode[] = [];
    for (const child of subject.children) {
      const built = buildScopeNode(child, ctx, selected, bindings);
      if (built) children.push(built);
    }
    // A subject with no surviving children is dropped (its topics were filtered
    // out or it holds no eligible inventory).
    if (children.length === 0) continue;

    subjects.push({
      id: subject.id,
      nameBn: subject.nameBn,
      nameEn: subject.nameEn,
      marks: subject.marks,
      allocationSource: subject.allocationSource,
      capacity: children.reduce((a, c) => a + c.capacity, 0),
      children,
    });
  }

  return {
    config,
    examCode: config.examCode,
    configVersion: config.version,
    subjects,
    bindings,
    dbSubjectByConfigId,
  };
}

// ── Public convenience: config + inventory + scope ─────────

export type PreparedScope = {
  config: ExamConfig;
  inventory: EcosystemInventory;
  scope: MaterializedScope;
};

/**
 * Resolve a config, load inventory, and materialise a scope in one step.
 * Returns `null` when the ecosystem code is unknown, or when the config fails
 * validation — the caller surfaces a 5xx, because an invalid config must never
 * produce a paper.
 */
export async function prepareScope(
  ecosystemCode: ExamEcosystemCode,
  ecosystemId: number | null,
  selection?: ScopeSelection,
  config?: ExamConfig,
): Promise<PreparedScope | null> {
  const resolvedConfig = config ?? getExamConfig(ecosystemCode);
  if (!resolvedConfig) return null;
  const validation = getExamConfigValidation(resolvedConfig);
  if (!validation.valid) return null;

  const [inventory, bangla] = await Promise.all([
    getEcosystemInventory(ecosystemCode, ecosystemId),
    getBanglaSubjects().catch(() => null),
  ]);

  const scope = materializeScope(resolvedConfig, inventory, bangla, selection);
  return { config: resolvedConfig, inventory, scope };
}

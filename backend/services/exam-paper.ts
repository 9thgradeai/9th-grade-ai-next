// backend/services/exam-paper.ts — syllabus-driven paper assembly.
//
// The single server-side authority that turns an exam configuration into an
// actually-buildable paper. It:
//   1. resolves the config + live inventory into an allocation scope,
//   2. runs the deterministic allocation engine (official marks, configured
//      weights, or a documented neutral fallback),
//   3. selects the questions for each allocated topic from the ELIGIBLE pool
//      (no within-paper duplicates),
//   4. returns the paper plus its allocation plan and diagnostics.
//
// Full papers (mock/real) use the OFFICIAL subject quotas as hard constraints —
// a paper that cannot meet them is reported as `infeasible` (the route turns
// that into an explicit error) rather than silently served short. Official
// TOPIC sub-quotas are guidance: an unmet sub-quota is disclosed and its marks
// are redistributed within the subject (still exactly the official subject
// total), never fabricated. Practice papers may disclose total deviations.
//
// Server-only; called from API route handlers with an authenticated userId for
// audit, but performs no writes itself. Question-set immutability is provided
// downstream by the attempt hash in exam-submission.ts (`hashQuestionSet`),
// which freezes the exact question set the moment /api/exam/start registers it.

import "server-only";

import { prisma } from "~backend/db";
import { AppError, InternalServerError, NotFoundError } from "~backend/errors";
import { resolveEcosystemId } from "~backend/services/ecosystem";
import { shuffleWithSeed } from "~backend/services/exam";
import {
  allocateScope,
  getExamConfigValidation,
  type AllocatedSubject,
  type AllocatedTopic,
  type AllocationDiagnostic,
  type AllocationResult,
  type ExamConfig,
  type ExamEcosystemCode,
  type ExamMode,
  type ScopeSelection,
  type ScoringPolicy,
} from "~backend/services/exam-config";
import {
  prepareScope,
  type LeafBinding,
  type MaterializedScope,
} from "~backend/services/exam-inventory";
import type { ExamQuestionDTO } from "@/lib/types";

/** Seconds per question for a practice paper when the config has no duration. */
const SECONDS_PER_QUESTION = 30;

export type PaperSubjectPlan = {
  id: string;
  nameBn: string;
  nameEn: string;
  requested: number;
  allocated: number;
  capacity: number;
  source: AllocatedSubject["source"];
  mandatory: boolean;
};

export type ConfiguredPaperDTO = {
  examCode: ExamEcosystemCode;
  configVersion: number;
  mode: ExamMode;
  examId: string;
  questions: ExamQuestionDTO[];
  requested: number;
  achievable: number;
  totalQuestions: number;
  durationSec: number;
  scoring: ScoringPolicy;
  seed: number;
  allocation: {
    outcome: AllocationResult["outcome"];
    subjects: PaperSubjectPlan[];
    diagnostics: AllocationDiagnostic[];
  };
};

export type PaperBuildRequest = {
  ecosystemCode: ExamEcosystemCode;
  mode: ExamMode;
  selection?: ScopeSelection;
  shuffleQuestions?: boolean;
  seed?: number;
};

// ── Leaf allocation collection ─────────────────────────────

function collectLeafAllocations(
  topic: AllocatedTopic,
  out: AllocatedTopic[],
): void {
  if (topic.children.length === 0) {
    if (topic.allocated > 0) out.push(topic);
    return;
  }
  for (const child of topic.children) collectLeafAllocations(child, out);
}

// ── Even (largest-remainder) split across bound leaves ─────

/**
 * Distribute a topic's allocation across its eligible (subjectId, path) leaves,
 * proportional to how many questions each leaf holds, capped by that leaf's
 * count. Integer + deterministic: the same inputs always yield the same split.
 */
function splitAcrossLeaves(
  total: number,
  leaves: LeafBinding["leaves"],
): number[] {
  const n = leaves.length;
  const alloc = new Array<number>(n).fill(0);
  if (n === 0 || total <= 0) return alloc;

  const sum = leaves.reduce((a, l) => a + l.count, 0);
  if (sum <= 0) return alloc;

  const raw = leaves.map((l) => (l.count * total) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  // Cap by capacity, redistributing any capped surplus to leaves with headroom.
  for (let i = 0; i < n; i++) alloc[i] = Math.min(floors[i], leaves[i].count);
  let surplus = total - alloc.reduce((a, b) => a + b, 0);
  let guard = surplus + n + 4;
  while (surplus > 0 && guard-- > 0) {
    let progressed = false;
    for (let i = 0; i < n && surplus > 0; i++) {
      if (alloc[i] < leaves[i].count) {
        alloc[i] += 1;
        surplus -= 1;
        progressed = true;
      }
    }
    if (!progressed) break;
  }
  return alloc;
}

// ── Question selection ─────────────────────────────────────

async function pickIdsForLeaf(
  subjectId: number,
  path: string,
  count: number,
  seed: number,
): Promise<number[]> {
  if (count <= 0) return [];
  const rows = await prisma.question.findMany({
    where: { subjectId, path },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return shuffleWithSeed(rows, seed).slice(0, count).map((r) => r.id);
}

async function fetchQuestions(
  ids: number[],
  nameBySubject: Map<number, string>,
): Promise<Map<number, ExamQuestionDTO>> {
  const out = new Map<number, ExamQuestionDTO>();
  if (ids.length === 0) return out;
  const rows = await prisma.question.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      subjectId: true,
      topic: true,
      subtopic: true,
      question: true,
      options: true,
      difficulty: true,
      sourceExam: true,
      year: true,
    },
  });
  for (const q of rows) {
    out.set(q.id, {
      id: q.id,
      subjectId: q.subjectId,
      subject: nameBySubject.get(q.subjectId) ?? "",
      topic: q.topic,
      subtopic: q.subtopic,
      question: q.question,
      options: Array.isArray(q.options) ? (q.options as string[]) : [],
      difficulty: q.difficulty as ExamQuestionDTO["difficulty"],
      sourceExam: q.sourceExam,
      year: q.year,
    });
  }
  return out;
}

// ── Assembly ───────────────────────────────────────────────

function durationFor(
  config: ExamConfig,
  mode: ExamMode,
  fullPaper: boolean,
  total: number,
): number {
  if (fullPaper && config.durationMin && config.durationMin > 0) {
    return config.durationMin * 60;
  }
  return Math.max(0, total) * SECONDS_PER_QUESTION;
}

type AssembledPaper = {
  questions: ExamQuestionDTO[];
  bySubjectCount: Map<string, number>;
};

async function assembleQuestions(
  scope: MaterializedScope,
  inventorySubjects: Array<{ id: number; nameBn: string }>,
  allocation: AllocationResult,
  seed: number,
): Promise<AssembledPaper> {
  const nameBySubject = new Map<number, string>();
  for (const s of inventorySubjects) nameBySubject.set(s.id, s.nameBn);

  const selectedIds = new Set<number>();
  const bySubjectCount = new Map<string, number>();
  const orderedIds: number[] = [];
  for (const subjectAlloc of allocation.subjects) {
    bySubjectCount.set(subjectAlloc.id, 0);
  }

  // Question selection must be awaited concurrently, so gather leaf jobs first.
  // Each job carries its CONFIG subject id/name so union-sourced rows (e.g. a
  // Bank Bangla leaf pulled into a BCS paper) are attributed to the right
  // subject and named correctly — otherwise the plan and the paper disagree.
  type Job = {
    subjectId: number;
    path: string;
    count: number;
    seed: number;
    configId: string;
    configName: string;
  };
  const jobs: Job[] = [];
  allocation.subjects.forEach((subjectAlloc, si) => {
    const leaves: AllocatedTopic[] = [];
    for (const topic of subjectAlloc.topics) collectLeafAllocations(topic, leaves);
    leaves.forEach((leaf, li) => {
      const binding = scope.bindings.get(leaf.id);
      if (!binding || binding.leaves.length === 0) return;
      const split = splitAcrossLeaves(leaf.allocated, binding.leaves);
      binding.leaves.forEach((bound, bi) => {
        const need = split[bi];
        if (need <= 0) return;
        jobs.push({
          subjectId: bound.subjectId,
          path: bound.path,
          count: need,
          seed: seed + si * 131_071 + li * 7919 + bi * 104_729,
          configId: subjectAlloc.id,
          configName: subjectAlloc.nameBn,
        });
      });
    });
  });

  const pickedPerJob = await Promise.all(
    jobs.map((job) => pickIdsForLeaf(job.subjectId, job.path, job.count, job.seed)),
  );

  // Attribute each UNIQUE pick to its config subject (first writer wins), so
  // the recounted plan and the assembled paper agree exactly.
  const subjectNameById = new Map<number, string>();
  jobs.forEach((job, idx) => {
    for (const id of pickedPerJob[idx]) {
      if (selectedIds.has(id)) continue;
      selectedIds.add(id);
      orderedIds.push(id);
      bySubjectCount.set(job.configId, (bySubjectCount.get(job.configId) ?? 0) + 1);
      subjectNameById.set(id, job.configName);
    }
  });

  const questionById = await fetchQuestions(orderedIds, nameBySubject);
  const questions = orderedIds
    .map((id) => questionById.get(id))
    .filter((q): q is ExamQuestionDTO => q !== undefined)
    // Union rows resolve to the CONFIG subject name (their DB name belongs to
    // the sibling ecosystem and would otherwise render blank).
    .map((q) => ({ ...q, subject: subjectNameById.get(q.id) ?? q.subject }));

  return { questions, bySubjectCount };
}

// ── Public API ─────────────────────────────────────────────

/**
 * Build a configured paper. Throws `AppError(422)` when a full paper cannot be
 * assembled from eligible inventory (never serves a truncated official paper).
 */
export async function buildConfiguredPaper(
  request: PaperBuildRequest,
): Promise<ConfiguredPaperDTO> {
  const { ecosystemCode, mode } = request;
  const fullPaper = mode === "mock" || mode === "real";

  let ecosystemId: number | undefined;
  try {
    ecosystemId = await resolveEcosystemId(ecosystemCode);
  } catch {
    throw new NotFoundError(`Unknown exam ecosystem: ${ecosystemCode}`);
  }
  if (ecosystemId === undefined) {
    throw new NotFoundError(`Unknown exam ecosystem: ${ecosystemCode}`);
  }

  const prepared = await prepareScope(
    ecosystemCode,
    ecosystemId,
    request.selection,
  );
  if (!prepared) {
    throw new AppError(
      500,
      "Exam configuration is invalid and cannot produce a paper.",
      "EXAM_CONFIG_INVALID",
    );
  }
  const { config, inventory, scope } = prepared;

  if (fullPaper && config.subjects.length !== scope.subjects.length) {
    throw new AppError(
      422,
      "A full paper requires every configured subject to be selectable.",
      "EXAM_SCOPE_INCOMPLETE",
    );
  }

  const allocation = allocateScope({
    examCode: config.examCode,
    configVersion: config.version,
    scoring: config.scoring,
    mode,
    subjects: scope.subjects,
    fullPaper,
    requested: request.selection?.requested,
    perSubject: request.selection?.perSubject,
    allowDeviations: !fullPaper,
  });

  if (allocation.outcome === "invalid") {
    throw new AppError(422, "The exam selection is invalid.", "EXAM_SELECTION_INVALID");
  }
  if (fullPaper && allocation.outcome === "infeasible") {
    throw new AppError(
      422,
      "A full paper cannot be assembled from the current question inventory.",
      "EXAM_PAPER_INFEASIBLE",
    );
  }

  const seed =
    typeof request.seed === "number" && Number.isInteger(request.seed)
      ? request.seed
      : Date.now();

  const assembled = await assembleQuestions(scope, inventory.subjects, allocation, seed);
  const questions =
    request.shuffleQuestions === false
      ? assembled.questions
      : shuffleWithSeed(assembled.questions, seed);

  const totalQuestions = questions.length;
  const subjects: PaperSubjectPlan[] = allocation.subjects.map((s) => ({
    id: s.id,
    nameBn: s.nameBn,
    nameEn: s.nameEn,
    requested: s.requested,
    allocated: assembled.bySubjectCount.get(s.id) ?? s.allocated,
    capacity: s.capacity,
    source: s.source,
    mandatory: s.mandatory,
  }));

  const examId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `exam-${Date.now()}-${seed}`;

  return {
    examCode: config.examCode,
    configVersion: config.version,
    mode,
    examId,
    questions,
    requested: allocation.requested,
    achievable: totalQuestions,
    totalQuestions,
    durationSec: durationFor(config, mode, fullPaper, totalQuestions),
    scoring: config.scoring,
    seed,
    allocation: {
      outcome: allocation.outcome,
      subjects,
      diagnostics: allocation.diagnostics,
    },
  };
}

// ── Readiness (no question selection) ──────────────────────

export type PaperReadiness = {
  examCode: ExamEcosystemCode;
  configVersion: number;
  mode: ExamMode;
  feasible: boolean;
  outcome: AllocationResult["outcome"];
  required: number;
  achievable: number;
  subjects: Array<{
    id: string;
    nameBn: string;
    required: number;
    capacity: number;
    deficit: number;
  }>;
  diagnostics: AllocationDiagnostic[];
};

/**
 * Report whether the official full paper for an ecosystem can be assembled
 * today — used by the dashboard to disclose shortages BEFORE a user starts a
 * mock test, without selecting any questions.
 */
export async function getPaperReadiness(
  ecosystemCode: ExamEcosystemCode,
): Promise<PaperReadiness | null> {
  let ecosystemId: number | undefined;
  try {
    ecosystemId = await resolveEcosystemId(ecosystemCode);
  } catch {
    return null;
  }
  if (ecosystemId === undefined) return null;

  const prepared = await prepareScope(ecosystemCode, ecosystemId);
  if (!prepared) return null;
  const { config, scope } = prepared;
  const validation = getExamConfigValidation(config);
  if (!validation.valid) {
    throw new InternalServerError("Exam configuration is invalid.");
  }

  const allocation = allocateScope({
    examCode: config.examCode,
    configVersion: config.version,
    scoring: config.scoring,
    mode: "mock",
    subjects: scope.subjects,
    fullPaper: true,
  });

  const subjects = scope.subjects.map((s) => {
    const allocated = allocation.subjects.find((a) => a.id === s.id);
    const required = allocated?.requested ?? s.marks;
    return {
      id: s.id,
      nameBn: s.nameBn,
      required,
      capacity: s.capacity,
      deficit: Math.max(0, required - s.capacity),
    };
  });

  return {
    examCode: config.examCode,
    configVersion: config.version,
    mode: "mock",
    // A subject that was dropped from scope also counts as a shortfall.
    feasible:
      allocation.outcome !== "infeasible" &&
      scope.subjects.length === config.subjects.length,
    outcome: allocation.outcome,
    required: config.totalQuestions,
    achievable: allocation.achievable,
    subjects,
    diagnostics: allocation.diagnostics,
  };
}

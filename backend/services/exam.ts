// backend/services/exam.ts — custom BCS-style exam engine (the "exam seam").
// Server-only. Provides the subject → topic → subtopic selection tree with real
// question counts, deterministic exam building (no duplicates, graceful
// shortfall handling), and BCS scoring (+1 correct / −0.5 wrong / 0 unanswered).
// Delegate to this from /api/exam/* route handlers — never embed logic there.

import "server-only";

import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";
import { recomputeAndAward } from "~backend/repositories/progress.repository";
import { emit } from "~backend/events/bus";
import { QueryCache } from "~backend/infrastructure/cache/query-cache";
import type { SubmittedAnswer } from "./activity";
import type {
  ExamSubjectDTO,
  ExamSelectionRequest,
  ExamBuildResultDTO,
  ExamQuestionDTO,
  ExamResultDTO,
  ExamReviewDTO,
} from "@/lib/types";

export const EXAM_MAX_QUESTIONS = 200;
export const EXAM_MIN_QUESTIONS = 1;

// ── Deterministic shuffle (mulberry32) ─────────────────────
function hashSeed(value: number): number {
  let h = value >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function createRng(seed: number): () => number {
  let a = hashSeed(seed);
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const rng = createRng(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// Allocate `total` items across `weights` using the largest-remainder method so
// the returned integers always sum to `total` (when the total is reachable).
function allocateLargestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (sum === 0) return weights.map(() => 0);
  if (sum <= total) return weights.map((w) => w);

  const base = weights.map((w) => Math.floor((w * total) / sum));
  let remainder = total - base.reduce((acc, b) => acc + b, 0);
  const fractions = weights
    .map((w, i) => ({ i, f: (w * total) / sum - base[i] }))
    .sort((a, b) => b.f - a.f);

  for (const item of fractions) {
    if (remainder <= 0) break;
    base[item.i] += 1;
    remainder -= 1;
  }
  return base;
}

// ── Selection tree (real counts, data-driven, recursive) ──
// The tree mirrors the recursive Topic taxonomy. Leaf question counts are
// aggregated up the path chain so every node reports how many questions exist
// under its whole subtree.
export async function getExamSelectionTree(): Promise<ExamSubjectDTO[]> {
  // Try cache first
  const cached = await QueryCache.getExamTree();
  if (cached) {
    return cached as ExamSubjectDTO[];
  }

  try {
    const [subjects, topicRows, countRows] = await Promise.all([
      prisma.subject.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.topic.findMany({
        orderBy: [{ subjectId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      }),
      prisma.question.groupBy({
        by: ["subjectId", "path"],
        _count: { _all: true },
      }),
    ]);

    const countMap = new Map<number, Map<string, number>>();
    for (const row of countRows) {
      let sub = countMap.get(row.subjectId);
      if (!sub) {
        sub = new Map();
        countMap.set(row.subjectId, sub);
      }
      sub.set(row.path, row._count._all);
    }

    const buildNode = (
      topic: (typeof topicRows)[number],
      childrenByParent: Map<string, (typeof topicRows)[number][]>,
      counts: Map<string, number>,
    ): ExamSubjectDTO["nodes"][number] => {
      const children = (childrenByParent.get(String(topic.id)) ?? [])
        .map((child) => buildNode(child, childrenByParent, counts))
        .filter((child) => child.questionCount > 0);
      const direct = counts.get(topic.path) ?? 0;
      const questionCount = direct + children.reduce((acc, c) => acc + c.questionCount, 0);
      return {
        id: topic.id,
        name: topic.name,
        path: topic.path,
        depth: topic.depth,
        questionCount,
        children,
      };
    };

    const result = subjects.map((s) => {
      const subjectTopics = topicRows.filter((t) => t.subjectId === s.id);
      const childrenByParent = new Map<string, (typeof topicRows)[number][]>();
      const roots: (typeof topicRows)[number][] = [];
      for (const t of subjectTopics) {
        if (t.parentId === null) {
          roots.push(t);
        } else {
          const key = String(t.parentId);
          if (!childrenByParent.has(key)) childrenByParent.set(key, []);
          childrenByParent.get(key)!.push(t);
        }
      }

      const counts = countMap.get(s.id) ?? new Map<string, number>();
      const nodes = roots
        .map((root) => buildNode(root, childrenByParent, counts))
        .filter((node) => node.questionCount > 0);
      const questionCount = nodes.reduce((acc, n) => acc + n.questionCount, 0);
      return {
        id: s.id,
        nameBn: s.nameBn,
        nameEn: s.nameEn,
        icon: s.icon,
        color: s.color ?? "",
        bg: s.bg ?? "",
        questionCount,
        nodes,
      };
    });

    // Cache the result
    await QueryCache.setExamTree(result);

    return result;
  } catch {
    throw new InternalServerError("Failed to fetch exam selection tree");
  }
}

// Leaf question counts per subject: path -> count. The path on a Question row
// is always a leaf path, so this is the "available question pool" per subject.
async function getLeafCounts(): Promise<Map<number, Map<string, number>>> {
  const rows = await prisma.question.groupBy({
    by: ["subjectId", "path"],
    _count: { _all: true },
  });
  const map = new Map<number, Map<string, number>>();
  for (const row of rows) {
    let sub = map.get(row.subjectId);
    if (!sub) {
      sub = new Map();
      map.set(row.subjectId, sub);
    }
    sub.set(row.path, row._count._all);
  }
  return map;
}

// Resolves the eligible leaf paths for a subject selection: the union of every
// selected node's subtree. `paths: []` means the whole subject.
function eligibleLeafPaths(
  leafCounts: Map<number, Map<string, number>>,
  subjectId: number,
  paths: string[],
): string[] {
  const counts = leafCounts.get(subjectId) ?? new Map<string, number>();
  const leaves = [...counts.keys()];
  if (paths.length === 0) return leaves;
  return leaves.filter((leaf) => paths.some((p) => leaf === p || leaf.startsWith(p + "/")));
}

// ── Validation ─────────────────────────────────────────────
function validateConfig(config: ExamSelectionRequest): Required<ExamSelectionRequest> {
  if (!config || typeof config !== "object") {
    throw new AppError(400, "Invalid exam configuration.", "VALIDATION_ERROR");
  }
  if (!Array.isArray(config.subjects) || config.subjects.length === 0) {
    throw new AppError(400, "Select at least one subject.", "VALIDATION_ERROR");
  }
  if (
    !Number.isInteger(config.questionCount) ||
    config.questionCount < EXAM_MIN_QUESTIONS ||
    config.questionCount > EXAM_MAX_QUESTIONS
  ) {
    throw new AppError(
      400,
      `questionCount must be an integer between ${EXAM_MIN_QUESTIONS} and ${EXAM_MAX_QUESTIONS}.`,
      "VALIDATION_ERROR",
    );
  }
  const durationSec = Number.isFinite(Number(config.durationSec))
    ? Math.max(0, Math.floor(Number(config.durationSec)))
    : 0;
  if (durationSec > 24 * 60 * 60) {
    throw new AppError(400, "durationSec is unreasonably large.", "VALIDATION_ERROR");
  }

  for (const subject of config.subjects) {
    if (!Number.isInteger(subject.subjectId) || subject.subjectId < 1) {
      throw new AppError(400, "Each subject needs a numeric subjectId.", "VALIDATION_ERROR");
    }
    if (!Array.isArray(subject.paths)) {
      throw new AppError(400, "Each subject needs a paths array.", "VALIDATION_ERROR");
    }
    for (const path of subject.paths) {
      if (typeof path !== "string" || path.length === 0) {
        throw new AppError(400, "Each path must be a non-empty string.", "VALIDATION_ERROR");
      }
    }
  }

  // Per-subject question counts: when every selected subject provides a valid
  // `count`, the effective questionCount is their sum; otherwise fall back to
  // the global questionCount with proportional (largest-remainder) allocation.
  const normalizedSubjects = config.subjects.map((s) => ({
    subjectId: s.subjectId,
    paths: s.paths,
    count: Number.isInteger(s.count) ? Math.max(0, s.count as number) : undefined,
  }));
  const hasPerSubjectCounts = normalizedSubjects.every((s) => s.count !== undefined);

  let effectiveQuestionCount = config.questionCount;
  if (hasPerSubjectCounts) {
    effectiveQuestionCount = normalizedSubjects.reduce((acc, s) => acc + (s.count ?? 0), 0);
    if (
      !Number.isInteger(effectiveQuestionCount) ||
      effectiveQuestionCount < EXAM_MIN_QUESTIONS ||
      effectiveQuestionCount > EXAM_MAX_QUESTIONS
    ) {
      throw new AppError(
        400,
        `Total per-subject question count must be between ${EXAM_MIN_QUESTIONS} and ${EXAM_MAX_QUESTIONS}.`,
        "VALIDATION_ERROR",
      );
    }
  } else if (
    !Number.isInteger(config.questionCount) ||
    config.questionCount < EXAM_MIN_QUESTIONS ||
    config.questionCount > EXAM_MAX_QUESTIONS
  ) {
    throw new AppError(
      400,
      `questionCount must be an integer between ${EXAM_MIN_QUESTIONS} and ${EXAM_MAX_QUESTIONS}.`,
      "VALIDATION_ERROR",
    );
  }

  return {
    subjects: normalizedSubjects,
    questionCount: effectiveQuestionCount,
    durationSec,
    shuffleQuestions: config.shuffleQuestions !== false,
    seed: typeof config.seed === "number" && Number.isInteger(config.seed) ? config.seed : Date.now(),
  };
}

function groupWhere(subjectId: number, paths: string[]) {
  return {
    subjectId,
    path: { in: paths },
  };
}

// ── Build an exam ──────────────────────────────────────────
export async function buildCustomExam(config: ExamSelectionRequest): Promise<ExamBuildResultDTO> {
  const validated = validateConfig(config);
  const { subjects, questionCount, durationSec, shuffleQuestions, seed } = validated;

  try {
    const subjectIds = subjects.map((s) => s.subjectId);
    const subjectRows = await prisma.subject.findMany({
      where: { id: { in: subjectIds } },
      select: { id: true, nameBn: true },
    });
    const nameBySubject = new Map(subjectRows.map((s) => [s.id, s.nameBn]));

    // Leaf question counts per subject drive availability + selection.
    const leafCounts = await getLeafCounts();

    // Per-subject availability: the union of every selected node's subtree.
    const subjectTotals = subjects.map((subject) => {
      const eligible = eligibleLeafPaths(leafCounts, subject.subjectId, subject.paths);
      const counts = leafCounts.get(subject.subjectId) ?? new Map<string, number>();
      return eligible.reduce((acc, p) => acc + (counts.get(p) ?? 0), 0);
    });

    const totalAvailable = subjectTotals.reduce((acc, c) => acc + c, 0);
    const finalCount = Math.min(questionCount, totalAvailable);
    const shortfall = questionCount - finalCount;

    // With per-subject counts, allocate each subject exactly its requested
    // count (capped by availability); otherwise distribute the requested count
    // across subjects proportionally (largest remainder).
    const perSubjectMode = subjects.every((s) => s.count !== undefined);
    const subjectAllocations = perSubjectMode
      ? subjects.map((s, i) => Math.min(s.count ?? 0, subjectTotals[i]))
      : allocateLargestRemainder(finalCount, subjectTotals);

    const selected: ExamQuestionDTO[] = [];

    await Promise.all(
      subjects.map(async (subject, si) => {
        const allocation = subjectAllocations[si];
        if (allocation === 0) return;

        const eligible = eligibleLeafPaths(leafCounts, subject.subjectId, subject.paths);
        if (eligible.length === 0) return;

        const ids = await pickQuestionIds(
          groupWhere(subject.subjectId, eligible),
          allocation,
          seed + si * 131_071,
        );
        selected.push(...(await fetchQuestionsByIds(ids, nameBySubject)));
      }),
    );

    // No duplicate questions within the exam (groups are disjoint, but guard anyway).
    const seen = new Set<number>();
    const unique = selected.filter((q) => {
      if (seen.has(q.id)) return false;
      seen.add(q.id);
      return true;
    });

    const ordered = shuffleQuestions ? shuffleWithSeed(unique, seed) : unique;

    const examId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `exam-${Date.now()}-${seed}`;

    return {
      examId,
      questions: ordered,
      totalQuestions: ordered.length,
      requested: questionCount,
      available: totalAvailable,
      shortfall,
      durationSec,
      config: validated,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to build custom exam");
  }
}

async function pickQuestionIds(
  where: Record<string, unknown>,
  count: number,
  seed: number,
): Promise<number[]> {
  const rows = await prisma.question.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return shuffleWithSeed(rows, seed)
    .slice(0, count)
    .map((r) => r.id);
}

async function fetchQuestionsByIds(
  ids: number[],
  nameBySubject: Map<number, string>,
): Promise<ExamQuestionDTO[]> {
  if (ids.length === 0) return [];
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
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids
    .map((id) => {
      const q = byId.get(id);
      if (!q) return null;
      return {
        id: q.id,
        subjectId: q.subjectId,
        subject: nameBySubject.get(q.subjectId) ?? "",
        topic: q.topic,
        subtopic: q.subtopic,
        question: q.question,
        options: (q.options as string[]) ?? [],
        difficulty: q.difficulty as ExamQuestionDTO["difficulty"],
        sourceExam: q.sourceExam,
        year: q.year,
      };
    })
    .filter((q): q is ExamQuestionDTO => q !== null);
}

// ── BCS scoring + persistence ──────────────────────────────
export async function submitCustomExam(
  userId: string,
  answers: SubmittedAnswer[],
): Promise<ExamResultDTO> {
  try {
    if (!Array.isArray(answers)) {
      throw new AppError(400, "answers must be an array.", "VALIDATION_ERROR");
    }
    const raw = answers as Array<Partial<SubmittedAnswer> | null>;
    for (const a of raw) {
      if (!a || !Number.isInteger(a.questionId) || typeof a.selected !== "string") {
        throw new AppError(400, "Each answer needs a numeric questionId and a selected string.", "VALIDATION_ERROR");
      }
    }
    const validAnswers = raw.filter((a): a is SubmittedAnswer => a !== null);

    const ids = validAnswers.map((a) => a.questionId);
    if (ids.length === 0) {
      throw new AppError(400, "answers must be a non-empty array.", "VALIDATION_ERROR");
    }

    const questions = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        subjectId: true,
        topic: true,
        subtopic: true,
        question: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        sourceExam: true,
        year: true,
        difficulty: true,
        subject: { select: { nameBn: true } },
      },
    });
    if (questions.length !== new Set(ids).size) {
      throw new AppError(400, "One or more questions were not found.", "VALIDATION_ERROR");
    }

    const byId = new Map(questions.map((q) => [q.id, q]));
    let correct = 0;
    let wrong = 0;
    let attempted = 0;

    const review: ExamReviewDTO[] = [];
    for (const a of validAnswers) {
      const q = byId.get(a.questionId);
      if (!q) continue;
      const userAnswer = a.selected.trim();
      const right = (q.correctAnswer ?? "").trim();
      const isCorrect = userAnswer.length > 0 && userAnswer === right;
      let status: ExamReviewDTO["status"];
      let marks = 0;
      if (userAnswer.length === 0) {
        status = "unanswered";
      } else if (isCorrect) {
        status = "correct";
        correct += 1;
        marks = 1;
      } else {
        status = "wrong";
        wrong += 1;
        marks = -0.5;
      }
      if (status !== "unanswered") attempted += 1;

      review.push({
        questionId: q.id,
        subject: q.subject?.nameBn ?? "",
        topic: q.topic,
        subtopic: q.subtopic,
        question: q.question,
        options: (q.options as string[]) ?? [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        userAnswer: a.selected,
        status,
        marks,
      });
    }

    const total = review.length;
    const unanswered = total - attempted;
    const positiveMarks = correct;
    const negativeMarks = Math.round(wrong * 0.5 * 100) / 100;
    const finalScore = Math.round((correct - wrong * 0.5) * 100) / 100;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const percentage = total > 0 ? Math.max(0, Math.min(100, Math.round((finalScore / total) * 100))) : 0;
    const pointsEarned = correct * 10;

    // Persist one attempt per ANSWERED question (unanswered questions are not
    // attempts) and recompute progress ATOMICALLY — attempts, points/accuracy
    // recompute and the exam counter commit together or not at all.
    const attempts = validAnswers
      .filter((a) => a.selected.trim().length > 0)
      .map((a) => {
        const q = byId.get(a.questionId);
        return {
          userId,
          questionId: q?.id ?? null,
          subjectId: q?.subjectId ?? null,
          subjectName: q?.subject?.nameBn ?? "",
          topic: q?.topic ?? "",
          correct: a.selected.trim() === (q?.correctAnswer ?? "").trim(),
          source: "exam",
        };
      });

    await prisma.$transaction(async (tx) => {
      if (attempts.length > 0) {
        await tx.questionAttempt.createMany({ data: attempts });
      }
      // Record a real mock-test result so the dashboard's history is populated.
      await tx.mockTestResult.create({
        data: { userId, score: percentage, correct, total, durationSec: 0 },
      });
      await recomputeAndAward(tx, userId, pointsEarned, 1);
    });
    emit({
      name: "EXAM_COMPLETED",
      userId,
      correct,
      wrong,
      finalScore,
    });

    return {
      summary: {
        total,
        attempted,
        correct,
        wrong,
        unanswered,
        positiveMarks,
        negativeMarks,
        finalScore,
        accuracy,
        percentage,
        pointsEarned,
      },
      review,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to submit custom exam");
  }
}
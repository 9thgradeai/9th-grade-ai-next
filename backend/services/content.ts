// src/lib/services/content.ts — server-side data access (the "backend seam").
// These functions query Prisma. They are only imported from server
// components / route handlers, never from client components.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import { log } from "~backend/infrastructure/observability/logger";
import {
  aggregateDailyActivity,
  buildActivityWindow,
  computeStreak,
  computeStreaks,
  fetchWrongNotebookQuestionIds,
} from "~backend/repositories/analytics.repository";
import { QueryCache } from "~backend/infrastructure/cache/query-cache";
import { normalizeFieldForDisplay } from "~backend/services/math";
import {
  getBanglaSubjects,
  getBanglaLeafPaths,
  mapSiblingPaths,
} from "~backend/services/bangla-union";
import type {
  QuestionDTO,
  QuestionBankCategoryDTO,
  ExamCategoryDTO,
  FlashcardDTO,
  StudyTaskDTO,
  DailyQuizDTO,
  FlashNewsDTO,
  NotificationDTO,
  DocumentDTO,
  ExamScheduleDTO,
  MockTestResultDTO,
  BadgeDTO,
} from "@/lib/types";

// ── Questions (powers Question Bank + Practice + Mock) ──
type QuestionFilters = {
  subject?: string;
  topic?: string;
  difficulty?: string;
  q?: string;
  paths?: string[];
  ids?: number[];
  year?: number;
  sourceExam?: string;
  bcsTerm?: string;
  paperId?: number;
  ecosystemId?: number;
  /** When true, return only Previous-Year Questions (paperId NOT NULL). */
  pyqOnly?: boolean;
};

async function buildQuestionWhere(opts?: QuestionFilters): Promise<Record<string, unknown>> {
  const conditions: Record<string, unknown>[] = [];
  // Bangla union (Practice: BCS Bangla pool shared into Bank Bangla and vice
  // versa — see backend/services/bangla-union.ts). When active, the subject
  // constraint spans both Bangla subjects and the ecosystem constraint is
  // dropped (rows live in two ecosystems by design).
  let unionPaths: string[] | null = null;
  if (opts?.subject) {
    // Scope the name lookup by ecosystem when the caller provides one.
    // Subject names repeat across ecosystems (BCS vs Bank), and an unscoped
    // findFirst could resolve to the OTHER ecosystem's subject — serving
    // questions from subjects/topics the user never selected.
    const subject = await prisma.subject.findFirst({
      where:
        opts.ecosystemId !== undefined
          ? { nameBn: opts.subject, ecosystemId: opts.ecosystemId }
          : { nameBn: opts.subject },
    });
    if (subject) {
      const bangla = await getBanglaSubjects();
      if (bangla.names.has(subject.id) && bangla.ids.length > 1) {
        const siblingIds = bangla.ids.filter((id) => id !== subject.id);
        conditions.push({ subjectId: { in: bangla.ids } });
        if (opts?.paths && opts.paths.length > 0) {
          const sibLeaves = await getBanglaLeafPaths(siblingIds);
          unionPaths = mapSiblingPaths(sibLeaves, siblingIds, opts.paths);
        }
      } else {
        conditions.push({ subjectId: subject.id });
        if (opts?.ecosystemId) {
          conditions.push({ ecosystemId: opts.ecosystemId });
        }
      }
    } else if (opts?.ecosystemId) {
      conditions.push({ ecosystemId: opts.ecosystemId });
    }
  } else if (opts?.ecosystemId) {
    conditions.push({ ecosystemId: opts.ecosystemId });
  }
  if (opts?.paths && opts.paths.length > 0) {
    const allPaths = unionPaths ? [...opts.paths, ...unionPaths] : opts.paths;
    const or: Record<string, unknown>[] = allPaths.map((p) => ({
      path: { startsWith: p.endsWith("/") ? p : `${p}/` },
    }));
    or.push({ path: { in: allPaths } });
    conditions.push({ OR: or });
  }
  if (opts?.topic) conditions.push({ topic: opts.topic });
  if (opts?.difficulty) conditions.push({ difficulty: opts.difficulty.toUpperCase() });
  if (opts?.q) {
    conditions.push({
      OR: [
        { question: { contains: opts.q } },
        { correctAnswer: { contains: opts.q } },
      ],
    });
  }
  if (opts?.ids && opts.ids.length > 0) {
    conditions.push({ id: { in: opts.ids } });
  }
  if (opts?.year !== undefined) {
    conditions.push({ year: opts.year });
  }
  if (opts?.sourceExam) {
    conditions.push({ sourceExam: { equals: opts.sourceExam, mode: "insensitive" } });
  }
  if (opts?.bcsTerm) {
    conditions.push({ bcsTerm: { equals: opts.bcsTerm, mode: "insensitive" } });
  }
  if (opts?.paperId) {
    conditions.push({ paperId: opts.paperId });
  }
  if (opts?.pyqOnly) {
    conditions.push({ paperId: { not: null } });
  }
  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function getQuestions(
  opts?: QuestionFilters & { page?: number; limit?: number },
): Promise<QuestionDTO[]> {
  const { questions } = await getQuestionsPage(opts);
  return questions;
}

type QuestionRow = {
  id: number;
  subjectId: number;
  subject?: { nameBn: string } | null;
  topic: string;
  subtopic: string;
  question: string;
  options: unknown;
  correctAnswer: string;
  explanation: string;
  difficulty: string;
  year: number | null;
  sourceExam: string;
  bcsTerm: string | null;
  questionType: string;
  correctAnswers: unknown;
  statements: unknown;
  media: unknown;
  paperId: number | null;
  examId: number | null;
  questionNumber: number | null;
  rawMath: boolean;
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Canonical Question row → DTO mapping (single place — extend here).
 *
 * Display safety net: every free-text field passes through
 * `normalizeFieldForDisplay`, so rows missed by ingestion-time normalization
 * still render book-exact KaTeX on the Practice Tab. The normalizer is
 * deterministic per input string (identical sources → identical outputs),
 * which preserves the answer-in-options invariant, and returns REVIEW-grade
 * fields byte-identical — the DB is never written here.
 */
export function toQuestionDTO(q: QuestionRow): QuestionDTO {
  // `rawMath` rows hold authoritative book Unicode (superscripts, subscripts,
  // √, −). The normalizer would rewrite ~44% of those fields into LaTeX, so
  // those rows bypass it entirely and are emitted byte-identical.
  const show = q.rawMath
    ? (v: unknown, field: string) => (typeof v === "string" ? v : "")
    : normalizeFieldForDisplay;
  const options = asStringArray(q.options).map((o, i) =>
    show(o, `options[${i}]`),
  );
  return {
    id: q.id,
    subjectId: q.subjectId,
    subject: q.subject?.nameBn ?? "",
    topic: q.topic,
    subtopic: q.subtopic,
    question: show(q.question, "question"),
    options,
    correctAnswer: show(q.correctAnswer, "correctAnswer"),
    explanation: show(q.explanation, "explanation"),
    difficulty: q.difficulty as QuestionDTO["difficulty"],
    year: q.year,
    sourceExam: q.sourceExam,
    bcsTerm: q.bcsTerm,
    questionType: q.questionType as QuestionDTO["questionType"],
    correctAnswers: asStringArray(q.correctAnswers).map((o, i) =>
      show(o, `correctAnswers[${i}]`),
    ),
    statements: asStringArray(q.statements).map((s, i) =>
      show(s, `statements[${i}]`),
    ),
    media: Array.isArray(q.media)
      ? (q.media as { kind: string; url: string; alt?: string }[]).filter((m) => typeof m?.url === "string")
      : [],
    paperId: q.paperId,
    examId: q.examId,
    questionNumber: q.questionNumber,
    rawMath: q.rawMath ?? false,
  };
}

/** Page + total count so clients can render pagination controls. */
export async function getQuestionsPage(
  opts?: QuestionFilters & { page?: number; limit?: number },
): Promise<{ questions: QuestionDTO[]; total: number; page: number; limit: number }> {
  try {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = await buildQuestionWhere(opts);

    // Build cache key from filters
    const cacheKey = JSON.stringify({ ...opts, page, limit });

    // Try cache first
    const cached = await QueryCache.getQuestions(cacheKey);
    if (cached) {
      return cached as { questions: QuestionDTO[]; total: number; page: number; limit: number };
    }

    const start = Date.now();
    const [rows, total] = await Promise.all([
      prisma.question.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: "asc" },
        include: { subject: true },
      }),
      prisma.question.count({ where }),
    ]);
    const duration = Date.now() - start;
    if (duration > 500) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[Slow Query] ${duration}ms — getQuestions`);
      } else if (Math.random() < 0.1) {
        log.warn("db.slow-query", { durationMs: duration, op: "getQuestions" });
      }
    }

    const result = {
      questions: rows.map((q) => toQuestionDTO(q)),
      total,
      page,
      limit,
    };

    // Cache the result
    await QueryCache.setQuestions(cacheKey, result);

    return result;
  } catch {
    throw new InternalServerError("Failed to fetch questions");
  }
}

export async function getQuestionById(id: number): Promise<QuestionDTO | null> {
  try {
    const q = await prisma.question.findUnique({
      where: { id },
      include: { subject: true },
    });
    if (!q) return null;
    return toQuestionDTO(q);
  } catch {
    throw new InternalServerError("Failed to fetch question by id");
  }
}

// ── Spotlight (Home-tab rotating MCQ) ─────────────────────
// Returns a small batch of RANDOM questions drawn strictly from the stored
// question bank — no generation, no AI, no fabrication. Subjects are served
// round-robin (one question per subject per round, starting at a random
// subject offset) so the client cycles across ALL subjects instead of
// camping on one. Each pick is a uniform random offset within its subject,
// so repeated calls keep surfacing fresh questions. Pass already-shown ids
// via `excludeIds` to keep the cycle free of repeats.
export async function getSpotlightQuestions(
  opts?: { ecosystemId?: number; count?: number; excludeIds?: number[] },
): Promise<QuestionDTO[]> {
  try {
    const count = Math.min(30, Math.max(1, Math.floor(opts?.count ?? 12)));
    const excluded = [...new Set((opts?.excludeIds ?? []).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
    const notIn = excluded.length > 0 ? { id: { notIn: excluded } } : {};

    const subjects = await prisma.subject.findMany({
      where: opts?.ecosystemId !== undefined ? { ecosystemId: opts.ecosystemId } : {},
      select: { id: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
    if (subjects.length === 0) return [];

    // Per-subject available counts (single aggregate query).
    const counts = await prisma.question.groupBy({
      by: ["subjectId"],
      _count: { _all: true },
      where: { ...notIn, ...(opts?.ecosystemId !== undefined ? { ecosystemId: opts.ecosystemId } : {}) },
    });
    const availableBySubject = new Map(counts.map((c) => [c.subjectId, c._count._all]));
    const live = subjects.filter((s) => (availableBySubject.get(s.id) ?? 0) > 0);
    if (live.length === 0) return [];

    // Random start offset → the subject cycle begins at a different subject
    // on every call instead of always leading with the first subject.
    const startAt = Math.floor(Math.random() * live.length);
    const ordered = live.map((_, i) => live[(startAt + i) % live.length]);

    const picked: QuestionDTO[] = [];
    // Batched round-robin: ONE query per live subject (not count+fetch per
    // subject per round — the old loop issued up to ~60 queries for a batch
    // of 12). Each subject contributes a small random-offset pool; pools are
    // interleaved so the cycle still covers ALL subjects. Pools are
    // per-subject disjoint, so no within-batch duplicates are possible.
    const perSubject = Math.max(1, Math.ceil(count / live.length) + 1);
    const ecoFilter = opts?.ecosystemId !== undefined ? { ecosystemId: opts.ecosystemId } : {};
    const pools = await Promise.all(
      ordered.map(async (s) => {
        const avail = Math.max(0, (availableBySubject.get(s.id) ?? 0) - excluded.length);
        if (avail <= 0) return [];
        const skip = avail > perSubject ? Math.floor(Math.random() * (avail - perSubject + 1)) : 0;
        return prisma.question.findMany({
          where: { subjectId: s.id, ...notIn, ...ecoFilter },
          skip,
          take: perSubject,
          orderBy: { id: "asc" },
          include: { subject: true },
        });
      }),
    );
    for (let i = 0; picked.length < count; i++) {
      let progressed = false;
      for (const pool of pools) {
        if (picked.length >= count) break;
        const row = pool[i];
        if (row) {
          picked.push(toQuestionDTO(row));
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    return picked;
  } catch {
    throw new InternalServerError("Failed to fetch spotlight questions");
  }
}

// Counts are derived live from real Previous-Year Questions only
// (paperId NOT NULL) grouped by subject — the Question Bank tab shows PYQ
// exclusively; the subject-wise practice pool (paperId NULL) is excluded.
// The `label` returned is the canonical `Subject.nameBn` so the client can
// keep using it as the subject filter in buildQuestionWhere.
export async function getQuestionBankCategories(ecosystemId?: number): Promise<QuestionBankCategoryDTO[]> {
  try {
    const pyqWhere = ecosystemId ? { ecosystemId, paperId: { not: null } } : { paperId: { not: null } };
    const subjectWhere = ecosystemId ? { ecosystemId } : {};
    const [subjects, counts] = await Promise.all([
      prisma.subject.findMany({ where: subjectWhere, select: { id: true, nameBn: true } }),
      prisma.question.groupBy({ by: ["subjectId"], _count: { _all: true }, where: pyqWhere }),
    ]);
    const countBySubject = new Map(counts.map((c) => [c.subjectId, c._count._all]));
    return subjects
      .map((s) => ({ id: s.id, label: s.nameBn, count: countBySubject.get(s.id) ?? 0 }))
      .sort((a, b) => b.count - a.count);
  } catch {
    throw new InternalServerError("Failed to fetch question bank categories");
  }
}

// ── Exam library (BCS → Preliminary → specific paper) ────
// Returns the available exam taxonomy hierarchy for browsing: ExamCategory
// ("BCS") → Exam ("BCS Preliminary") → ExamPaper ("50th BCS"). Only papers
// actually present in the data are returned; no paper metadata is fabricated.
export async function getQuestionBankExams(ecosystemId?: number): Promise<ExamCategoryDTO[]> {
  try {
    const where = ecosystemId ? { ecosystemId } : {};
    const categories = await prisma.examCategory.findMany({
      where,
      orderBy: { sortOrder: "asc" },
      include: {
        exams: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          include: {
            papers: {
              orderBy: [{ sortOrder: "asc" }, { bcsTerm: "desc" }, { id: "asc" }],
            },
          },
        },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      ecosystemId: c.ecosystemId,
      slug: c.slug,
      nameBn: c.nameBn,
      nameEn: c.nameEn,
      icon: c.icon,
      color: c.color,
      bg: c.bg,
      sortOrder: c.sortOrder,
      exams: c.exams.map((e) => ({
        id: e.id,
        slug: e.slug,
        nameBn: e.nameBn,
        nameEn: e.nameEn,
        type: e.type as ExamCategoryDTO["exams"][number]["type"],
        durationMin: e.durationMin,
        totalQuestions: e.totalQuestions,
        year: e.year,
        heldOn: e.heldOn ? e.heldOn.toISOString() : null,
        verified: e.verified,
        sortOrder: e.sortOrder,
        papers: e.papers.map((p) => ({
          id: p.id,
          slug: p.slug,
          titleBn: p.titleBn,
          titleEn: p.titleEn,
          bcsTerm: p.bcsTerm,
          termLabel: p.termLabel,
          year: p.year,
          heldOn: p.heldOn ? p.heldOn.toISOString() : null,
          durationMin: p.durationMin,
          totalQuestions: p.totalQuestions,
          availableQuestions: p.availableQuestions,
          provenance: p.provenance,
          verified: p.verified,
        })),
      })),
    }));
  } catch {
    throw new InternalServerError("Failed to fetch exam library");
  }
}

// ── Wrong-Answer Notebook (ভুলের নোটবুক) ─────────────────
// A question enters the notebook when its latest attempt by the user is wrong
// and leaves the moment they answer it correctly. Returns paginated Question
// DTOs so the UI can reuse the standard question rendering + practice flow.
export async function getWrongAnswerNotebook(
  userId: string,
  opts?: { page?: number; limit?: number },
): Promise<{ questions: QuestionDTO[]; total: number; page: number; limit: number }> {
  try {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts?.limit ?? 20));

    const ids = await fetchWrongNotebookQuestionIds(userId);
    if (ids.length === 0) {
      return { questions: [], total: 0, page, limit };
    }
    return await getQuestionsPage({ ids, page, limit });
  } catch {
    throw new InternalServerError("Failed to fetch wrong-answer notebook");
  }
}

export type LeaderboardEntryDTO = {
  rank: number;
  name: string;
  points: number;
  streak: number;
};

export type LeaderboardDTO = {
  entries: LeaderboardEntryDTO[];
  me: { rank: number; points: number } | null;
};

// ── Leaderboard (server-authoritative, points-ranked) ─────
export async function getLeaderboard(
  userId: string,
  limit = 20,
): Promise<LeaderboardDTO> {
  try {
    // Leaderboard is hot but slow-changing: serve the 30s cache when fresh so
    // the per-row streak fan-out below doesn't run on every poll.
    const cached = await QueryCache.getLeaderboard(limit);
    if (cached) {
      const me = await leaderboardMe(userId);
      return { ...(cached as Omit<LeaderboardDTO, "me">), me };
    }
    const rows = await prisma.userProgress.findMany({
      orderBy: { points: "desc" },
      take: limit,
      select: {
        userId: true,
        points: true,
        user: { select: { name: true, handle: true } },
      },
    });

    // Streak is server-authoritative (derived from attempt days), never stored,
    // so it can't be inflated client-side. Batched: ONE query for the whole
    // board instead of N per-user queries.
    const streakByUser = await computeStreaks(rows.map((r) => r.userId));

    const entries: LeaderboardEntryDTO[] = rows.map((r, i) => ({
      rank: i + 1,
      name: r.user?.name || r.user?.handle || "অজানা",
      points: r.points,
      streak: streakByUser.get(r.userId) ?? 0,
    }));

    const me = await leaderboardMe(userId);

    const result = { entries, me };
    await QueryCache.setLeaderboard(limit, { entries });
    return result;
  } catch {
    throw new InternalServerError("Failed to fetch leaderboard");
  }
}

async function leaderboardMe(userId: string): Promise<LeaderboardDTO["me"]> {
  const progress = await prisma.userProgress.findUnique({
    where: { userId },
    select: { points: true },
  });
  if (!progress) return null;
  const rank =
    (await prisma.userProgress.count({ where: { points: { gt: progress.points } } })) + 1;
  return { rank, points: progress.points };
}

// ── Badge catalog (moved out of the route handler — Phase 4) ──
// Real unlock state lives in UserBadge; the seed-time `unlockedSeed` flag is
// only a fallback for unauthenticated catalog views.
export async function getBadgeCatalog(userId?: string | null): Promise<BadgeDTO[]> {
  try {
    const [badges, userBadges] = await Promise.all([
      prisma.badge.findMany({ orderBy: { id: "asc" } }),
      userId
        ? prisma.userBadge.findMany({
            where: { userId },
            select: { badgeId: true, unlockedAt: true },
          })
        : Promise.resolve([] as Array<{ badgeId: number; unlockedAt: Date }>),
    ]);
    const unlockedBy = new Map(userBadges.map((ub) => [ub.badgeId, ub.unlockedAt]));
    return badges.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      rarity: b.rarity,
      unlocked: unlockedBy.has(b.id) || b.unlockedSeed,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch badges");
  }
}

// ── Flashcards ───────────────────────────────────────────
// Content is shared; scheduling state is overlaid from the requesting user's
// FlashcardUserState (additive optional fields — API contract preserved).
export async function getFlashcards(
  subjectName?: string,
  userId?: string | null,
  exam?: string,
): Promise<FlashcardDTO[]> {
  try {
    const rows = await prisma.flashcard.findMany({
      where: subjectName ? { subjectName } : undefined,
      orderBy: { id: "asc" },
    });
    const examFilter = exam?.trim().toUpperCase();
    const visible = examFilter
      ? rows.filter((f) => {
          const rel = f.examRelevance as string[] | null;
          return !rel || rel.length === 0 || rel.map((r) => r.toUpperCase()).includes(examFilter);
        })
      : rows;
    const states = userId
      ? await prisma.flashcardUserState.findMany({ where: { userId } })
      : [];
    const stateByCard = new Map(states.map((s) => [s.flashcardId, s]));
    return visible.map((f) => {
      const s = stateByCard.get(f.id);
      return {
        id: f.id,
        subjectName: f.subjectName,
        question: f.question,
        answer: f.answer,
        hint: f.hint,
        difficulty: f.difficulty as FlashcardDTO["difficulty"],
        examRelevance: (f.examRelevance as string[] | null) ?? null,
        ...(s
          ? {
              srs: {
                nextReview: s.nextReview.toISOString(),
                intervalDays: s.interval,
                easeFactor: s.easeFactor,
                repetitions: s.repetitions,
                lapses: s.lapses,
                lastRating: s.lastRating ?? undefined,
              },
            }
          : {}),
      };
    });
  } catch {
    throw new InternalServerError("Failed to fetch flashcards");
  }
}

// ── Study plan ───────────────────────────────────────────
// Template tasks are visible to everyone; completion state comes from the
// requesting user's StudyTaskCompletion rows (Phase 2B2).
export async function getStudyPlan(
  userId: string,
  opts?: { day?: string },
): Promise<StudyTaskDTO[]> {
  try {
    // Sprint 3: Home's tasks scope only renders today's weekday (it filtered
    // the whole template client-side). Push the filter down so the global
    // template + completions aren't shipped on every Home mount.
    const [days, completions] = await Promise.all([
      prisma.studyPlanDay.findMany({
        where: opts?.day ? { day: opts.day } : undefined,
        include: { tasks: true },
        orderBy: { id: "asc" },
      }),
      prisma.studyTaskCompletion.findMany({
        where: { userId },
        select: { taskId: true },
      }),
    ]);
    const done = new Set(completions.map((c) => c.taskId));
    const tasks: StudyTaskDTO[] = [];
    for (const day of days) {
      for (const t of day.tasks) {
        tasks.push({
          id: t.id,
          dayId: t.dayId,
          day: day.day,
          date: day.date,
          title: t.title,
          subject: t.subject,
          duration: t.duration,
          priority: t.priority as StudyTaskDTO["priority"],
          description: t.description,
          completed: done.has(t.id),
        });
      }
    }
    return tasks;
  } catch {
    throw new InternalServerError("Failed to fetch study plan");
  }
}

// ── Daily quiz ───────────────────────────────────────────
// `completed` / `score` reflect the REQUESTING user's DailyQuizParticipation
// (Phase 2). Anonymous callers get neutral flags — never another user's state.
export async function getDailyQuiz(userId?: string | null, ecosystemId?: number): Promise<DailyQuizDTO | null> {
  try {
    const where = ecosystemId ? { ecosystemId } : {};
    const quiz = await prisma.dailyQuiz.findFirst({
      where,
      include: { questions: true },
      orderBy: { id: "desc" },
    });
    if (!quiz) return null;
    const participation = userId
      ? await prisma.dailyQuizParticipation.findUnique({
          where: { userId_quizId: { userId, quizId: quiz.id } },
        })
      : null;
    return {
      id: quiz.id,
      date: quiz.date,
      completed: participation?.status === "COMPLETED",
      score: participation?.score ?? 0,
      claimed: false, // legacy global flag retired; rewards ship per-user later
      questions: quiz.questions.map((q) => ({
        id: q.id,
        subject: q.subject,
        topic: q.topic,
        question: q.question,
        options: (q.options as string[]) ?? [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
      })),
    };
  } catch {
    throw new InternalServerError("Failed to fetch daily quiz");
  }
}

// ── News / recommendations / gamification ───────────────
export async function getFlashNews(): Promise<FlashNewsDTO[]> {
  try {
    const rows = await prisma.flashNews.findMany({
      where: { verified: true },
      orderBy: { id: "desc" },
    });
    return rows.map((n) => ({
      id: n.id,
      tag: n.tag,
      titleBn: n.titleBn,
      titleEn: n.titleEn ?? "",
      text: n.text,
      full: n.full,
      date: n.date,
      readTime: n.readTime,
      categoryBn: n.categoryBn ?? "",
      categoryEn: n.categoryEn ?? "",
      sourceUrl: n.sourceUrl ?? undefined,
      verified: n.verified,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch flash news");
  }
}

export async function getNotifications(
  userId: string,
  opts: { limit?: number; cursorId?: number } = {},
): Promise<{
  items: NotificationDTO[];
  nextCursor: number | null;
  total: number;
}> {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 20)), 50);
  try {
    const rows = await prisma.appNotification.findMany({
      include: { reads: { where: { userId } } },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      // Keyset pagination (Phase 6): position on the last-seen row id within
      // the (timestamp desc, id desc) ordering. Bounded work per page.
      ...(opts.cursorId ? { cursor: { id: opts.cursorId }, skip: 1 } : {}),
      take: limit,
    });
    const total = await prisma.appNotification.count();
    const items = rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      timestamp: n.timestamp.toISOString(),
      read: n.reads.length > 0,
    }));
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;
    return { items, nextCursor, total };
  } catch {
    throw new InternalServerError("Failed to fetch notifications");
  }
}

export async function getDocuments(): Promise<DocumentDTO[]> {
  try {
    const rows = await prisma.document.findMany({ orderBy: { id: "asc" } });
    return rows.map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      type: d.type,
      url: d.url,
      description: d.description,
      year: d.year,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch documents");
  }
}

// ── Exam schedule ────────────────────────────────────────
export async function getExamSchedule(): Promise<ExamScheduleDTO[]> {
  try {
    const rows = await prisma.examSchedule.findMany({
      where: { verified: true },
      orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
    });
    return rows.map((e) => ({
      id: e.id,
      titleBn: e.titleBn,
      titleEn: e.titleEn,
      type: e.type,
      date: e.date.toISOString(),
      year: e.year,
      circularNo: e.circularNo,
      note: e.note,
      sourceUrl: e.sourceUrl ?? undefined,
      verified: e.verified,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch exam schedule");
  }
}

// ── Mock test results ────────────────────────────────────
export async function getMockTestResults(userId: string): Promise<MockTestResultDTO[]> {
  try {
    const rows = await prisma.mockTestResult.findMany({
      where: { userId },
      include: { mockTest: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return rows.map((r) => ({
      id: r.id,
      mockTestId: r.mockTestId,
      title: r.mockTest?.title ?? "মক টেস্ট",
      score: r.score,
      correct: r.correct,
      total: r.total,
      durationSec: r.durationSec,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    throw new InternalServerError("Failed to fetch mock test results");
  }
}

// ── Dashboard stats (real, per-user) ─────────────────────
// All attempt-derived numbers come from DB-side aggregates (Phase 6): cost is
// O(subjects/days) rows regardless of how much history the user accumulates.
// `activityDays` sizes the per-day activity window the client charts against
// (7 = week, 30 = month, 365 = "all time"); it is clamped defensively.
export async function getDashboardStats(
  userId: string,
  activityDays: number = 7,
): Promise<{
  points: number;
  exams: number;
  rank: number;
  streak: number;
  questionsAnswered: number;
  accuracy: number;
  completion: number;
  flashcardsReviewed: number;
  aiQuestionsAsked: number;
  activity: { date: string; answered: number; correct: number }[];
}> {
  const days = Number.isFinite(activityDays)
    ? Math.min(365, Math.max(1, Math.round(activityDays)))
    : 7;
  try {
    const [questionCount, progress, activity, streak] = await Promise.all([
      prisma.question.count(),
      prisma.userProgress.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      aggregateDailyActivity(userId, days),
      // Derived from the attempt log — never trusts the stored counter,
      // which clients could previously write to directly.
      computeStreak(userId),
    ]);

    const rank =
      (await prisma.userProgress.count({
        where: { points: { gt: progress.points } },
      })) + 1;

    return {
      points: progress.points,
      exams: progress.examsAttempted,
      rank,
      streak,
      questionsAnswered: progress.questionsAnswered,
      accuracy: progress.accuracy,
      completion:
        questionCount > 0
          ? Math.min(100, Math.round((progress.questionsAnswered / (questionCount * 10)) * 100))
          : 0,
      flashcardsReviewed: progress.flashcardsReviewed,
      aiQuestionsAsked: progress.aiQuestionsAsked,
      activity: buildActivityWindow(activity, days),
    };
  } catch {
    throw new InternalServerError("Failed to fetch dashboard stats");
  }
}

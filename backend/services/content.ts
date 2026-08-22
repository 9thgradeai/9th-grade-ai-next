// src/lib/services/content.ts — server-side data access (the "backend seam").
// These functions query Prisma. They are only imported from server
// components / route handlers, never from client components.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import {
  aggregateDailyActivity,
  buildActivityWindow,
  computeStreak,
} from "~backend/repositories/analytics.repository";
import type {
  QuestionDTO,
  QuestionBankCategoryDTO,
  FlashcardDTO,
  StudyTaskDTO,
  DailyQuizDTO,
  FlashNewsDTO,
  RecommendationDTO,
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
};

async function buildQuestionWhere(opts?: QuestionFilters): Promise<Record<string, unknown>> {
  // All filters are AND-ed; `paths` matches a question whose leaf path is a
  // selected node or lives anywhere under one of its subtrees.
  const conditions: Record<string, unknown>[] = [];
  if (opts?.subject) {
    const subject = await prisma.subject.findFirst({ where: { nameBn: opts.subject } });
    if (subject) conditions.push({ subjectId: subject.id });
  }
  if (opts?.paths && opts.paths.length > 0) {
    const or: Record<string, unknown>[] = opts.paths.map((p) => ({
      path: { startsWith: p.endsWith("/") ? p : `${p}/` },
    }));
    or.push({ path: { in: opts.paths } });
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
  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function getQuestions(
  opts?: QuestionFilters & { page?: number; limit?: number },
): Promise<QuestionDTO[]> {
  const { questions } = await getQuestionsPage(opts);
  return questions;
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
    if (duration > 500 && process.env.NODE_ENV === "development") {
      console.warn(`[Slow Query] ${duration}ms — getQuestions`);
    }

    return {
      questions: rows.map((q) => ({
        id: q.id,
        subjectId: q.subjectId,
        subject: q.subject?.nameBn ?? "",
        topic: q.topic,
        subtopic: q.subtopic,
        question: q.question,
        options: (q.options as string[]) ?? [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: q.difficulty as QuestionDTO["difficulty"],
        year: q.year,
        sourceExam: q.sourceExam,
      })),
      total,
      page,
      limit,
    };
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
    return {
      id: q.id,
      subjectId: q.subjectId,
      subject: q.subject?.nameBn ?? "",
      topic: q.topic,
      subtopic: q.subtopic,
      question: q.question,
      options: (q.options as string[]) ?? [],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty as QuestionDTO["difficulty"],
      year: q.year,
      sourceExam: q.sourceExam,
    };
  } catch {
    throw new InternalServerError("Failed to fetch question by id");
  }
}

export async function getQuestionBankCategories(): Promise<QuestionBankCategoryDTO[]> {
  try {
    const rows = await prisma.questionBankCategory.findMany({ orderBy: { count: "desc" } });
    return rows.map((c) => ({ id: c.id, label: c.label, count: c.count }));
  } catch {
    throw new InternalServerError("Failed to fetch question bank categories");
  }
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
): Promise<FlashcardDTO[]> {
  try {
    const rows = await prisma.flashcard.findMany({
      where: subjectName ? { subjectName } : undefined,
      orderBy: { id: "asc" },
    });
    const states = userId
      ? await prisma.flashcardUserState.findMany({ where: { userId } })
      : [];
    const stateByCard = new Map(states.map((s) => [s.flashcardId, s]));
    return rows.map((f) => {
      const s = stateByCard.get(f.id);
      return {
        id: f.id,
        subjectName: f.subjectName,
        question: f.question,
        answer: f.answer,
        hint: f.hint,
        difficulty: f.difficulty as FlashcardDTO["difficulty"],
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
export async function getStudyPlan(userId: string): Promise<StudyTaskDTO[]> {
  try {
    const [days, completions] = await Promise.all([
      prisma.studyPlanDay.findMany({ include: { tasks: true }, orderBy: { id: "asc" } }),
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
export async function getDailyQuiz(userId?: string | null): Promise<DailyQuizDTO | null> {
  try {
    const quiz = await prisma.dailyQuiz.findFirst({
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
    const rows = await prisma.flashNews.findMany({ orderBy: { id: "desc" } });
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
    }));
  } catch {
    throw new InternalServerError("Failed to fetch flash news");
  }
}

export async function getRecommendations(): Promise<RecommendationDTO[]> {
  try {
    const rows = await prisma.recommendation.findMany({ orderBy: { id: "asc" } });
    return rows.map((r) => ({
      id: r.id,
      subjectBn: r.subjectBn,
      subjectEn: r.subjectEn ?? "",
      metric: r.metric,
      accuracy: r.accuracy,
      titleBn: r.titleBn,
      titleEn: r.titleEn ?? "",
      descriptionBn: r.descriptionBn,
      descriptionEn: r.descriptionEn ?? "",
      ctaBn: r.ctaBn,
      ctaEn: r.ctaEn ?? "",
    }));
  } catch {
    throw new InternalServerError("Failed to fetch recommendations");
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
export async function getDashboardStats(userId: string): Promise<{
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
  try {
    const [questionCount, progress, activity, streak] = await Promise.all([
      prisma.question.count(),
      prisma.userProgress.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      aggregateDailyActivity(userId, 7),
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
      activity: buildActivityWindow(activity, 7),
    };
  } catch {
    throw new InternalServerError("Failed to fetch dashboard stats");
  }
}

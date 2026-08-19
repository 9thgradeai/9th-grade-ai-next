// src/lib/services/content.ts — server-side data access (the "backend seam").
// These functions query Prisma. They are only imported from server
// components / route handlers, never from client components.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
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
} from "@/lib/types";

// ── Questions (powers Question Bank + Practice + Mock) ──
export async function getQuestions(opts?: {
  subject?: string;
  topic?: string;
  difficulty?: string;
  q?: string;
  paths?: string[];
  page?: number;
  limit?: number;
}): Promise<QuestionDTO[]> {
  try {
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
    const where = conditions.length > 0 ? { AND: conditions } : {};

    const page = opts?.page ?? 1;
    const limit = opts?.limit ?? 20;
    const skip = (page - 1) * limit;

    const start = Date.now();
    const rows = await prisma.question.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: "asc" },
      include: { subject: true },
    });
    const duration = Date.now() - start;
    if (duration > 500 && process.env.NODE_ENV === "development") {
      console.warn(`[Slow Query] ${duration}ms — getQuestions`);
    }

    return rows.map((q) => ({
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
    }));
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

// ── Flashcards ───────────────────────────────────────────
export async function getFlashcards(subjectName?: string): Promise<FlashcardDTO[]> {
  try {
    const rows = await prisma.flashcard.findMany({
      where: subjectName ? { subjectName } : undefined,
      orderBy: { id: "asc" },
    });
    return rows.map((f) => ({
      id: f.id,
      subjectName: f.subjectName,
      question: f.question,
      answer: f.answer,
      hint: f.hint,
      difficulty: f.difficulty as FlashcardDTO["difficulty"],
    }));
  } catch {
    throw new InternalServerError("Failed to fetch flashcards");
  }
}

// ── Study plan ───────────────────────────────────────────
export async function getStudyPlan(userId: string): Promise<StudyTaskDTO[]> {
  try {
    const days = await prisma.studyPlanDay.findMany({
      include: { tasks: { where: { userId }, include: { user: true } } },
      orderBy: { id: "asc" },
    });
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
          completed: t.completed,
        });
      }
    }
    return tasks;
  } catch {
    throw new InternalServerError("Failed to fetch study plan");
  }
}

// ── Daily quiz ───────────────────────────────────────────
export async function getDailyQuiz(): Promise<DailyQuizDTO | null> {
  try {
    const quiz = await prisma.dailyQuiz.findFirst({
      include: { questions: true },
      orderBy: { id: "desc" },
    });
    if (!quiz) return null;
    return {
      id: quiz.id,
      date: quiz.date,
      completed: quiz.completed,
      score: quiz.score,
      claimed: quiz.claimed,
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

export async function getNotifications(userId: string): Promise<NotificationDTO[]> {
  try {
    const rows = await prisma.appNotification.findMany({
      include: { reads: { where: { userId } } },
      orderBy: { timestamp: "desc" },
    });
    return rows.map((n) => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      timestamp: n.timestamp.toISOString(),
      read: n.reads.length > 0,
    }));
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
    const [questionCount, progress, attempts] = await Promise.all([
      prisma.question.count(),
      prisma.userProgress.upsert({
        where: { userId },
        update: {},
        create: { userId },
      }),
      prisma.questionAttempt.findMany({
        where: { userId },
        select: { correct: true, createdAt: true },
      }),
    ]);

    const rank =
      (await prisma.userProgress.count({
        where: { points: { gt: progress.points } },
      })) + 1;

    const activityMap = new Map<string, { answered: number; correct: number }>();
    const now = Date.now();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      activityMap.set(key, { answered: 0, correct: 0 });
    }
    for (const a of attempts) {
      const key = a.createdAt.toISOString().slice(0, 10);
      const entry = activityMap.get(key);
      if (entry) {
        entry.answered += 1;
        if (a.correct) entry.correct += 1;
      }
    }
    const activity = Array.from(activityMap.entries()).map(([date, v]) => ({
      date,
      answered: v.answered,
      correct: v.correct,
    }));

    return {
      points: progress.points,
      exams: progress.examsAttempted,
      rank,
      streak: progress.streak,
      questionsAnswered: progress.questionsAnswered,
      accuracy: progress.accuracy,
      completion:
        questionCount > 0
          ? Math.min(100, Math.round((progress.questionsAnswered / (questionCount * 10)) * 100))
          : 0,
      flashcardsReviewed: progress.flashcardsReviewed,
      aiQuestionsAsked: progress.aiQuestionsAsked,
      activity,
    };
  } catch {
    throw new InternalServerError("Failed to fetch dashboard stats");
  }
}

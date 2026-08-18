// src/lib/services/content.ts — server-side data access (the "backend seam").
// These functions query Prisma. They are only imported from server
// components / route handlers, never from client components.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import type {
  SubjectDTO,
  TopicDTO,
  QuestionDTO,
  QuestionBankCategoryDTO,
  ExamArchiveDTO,
  FlashcardDTO,
  StudyTaskDTO,
  DailyQuizDTO,
  MockTestDTO,
  FlashNewsDTO,
  RecommendationDTO,
  BadgeDTO,
  NotificationDTO,
  OfflinePackDTO,
  DocumentDTO,
} from "@/lib/types";

// ── Subjects ─────────────────────────────────────────────
export async function getSubjects(): Promise<SubjectDTO[]> {
  try {
    const rows = await prisma.subject.findMany({ orderBy: { sortOrder: "asc" } });
    return rows.map((s) => ({
      id: s.id,
      nameBn: s.nameBn,
      nameEn: s.nameEn,
      icon: s.icon,
      color: s.color ?? "",
      bg: s.bg ?? "",
      sortOrder: s.sortOrder,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch subjects");
  }
}

export async function getSubjectWithStats(): Promise<SubjectDTO[]> {
  try {
    const start = Date.now();
    const subjects = await prisma.subject.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const duration = Date.now() - start;
    if (duration > 500 && process.env.NODE_ENV === "development") {
      console.warn(`[Slow Query] ${duration}ms — getSubjectWithStats`);
    }

    return subjects.map((s) => ({
      id: s.id,
      nameBn: s.nameBn,
      nameEn: s.nameEn,
      icon: s.icon,
      color: s.color ?? "",
      bg: s.bg ?? "",
      sortOrder: s.sortOrder,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch subjects with stats");
  }
}

// ── Topics ───────────────────────────────────────────────
export async function getTopics(subjectName?: string): Promise<TopicDTO[]> {
  try {
    const rows = await prisma.topic.findMany({
      where: subjectName ? { subject: { nameBn: subjectName } } : undefined,
      orderBy: { id: "asc" },
    });
    return rows.map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      groupName: t.groupName,
      name: t.name,
      questionCount: String(t.questionCount),
    }));
  } catch {
    throw new InternalServerError("Failed to fetch topics");
  }
}

// ── Questions (powers Question Bank + Practice + Mock) ──
export async function getQuestions(opts?: {
  subject?: string;
  topic?: string;
  difficulty?: string;
  q?: string;
  page?: number;
  limit?: number;
}): Promise<QuestionDTO[]> {
  try {
    const where: Record<string, unknown> = {};
    if (opts?.subject) {
      const subject = await prisma.subject.findFirst({ where: { nameBn: opts.subject } });
      if (subject) where.subjectId = subject.id;
    }
    if (opts?.topic) where.topic = opts.topic;
    if (opts?.difficulty) where.difficulty = opts.difficulty.toUpperCase();
    if (opts?.q) {
      where.OR = [
        { question: { contains: opts.q } },
        { correctAnswer: { contains: opts.q } },
      ];
    }

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

export async function getExamArchives(): Promise<ExamArchiveDTO[]> {
  try {
    const rows = await prisma.examArchive.findMany({ orderBy: { id: "asc" } });
    return rows.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon,
      count: a.count,
      yearRange: a.yearRange,
      status: a.status,
      accent: a.accent ?? "",
    }));
  } catch {
    throw new InternalServerError("Failed to fetch exam archives");
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

// ── Mock tests ───────────────────────────────────────────
export async function getMockTests(): Promise<MockTestDTO[]> {
  try {
    const tests = await prisma.mockTest.findMany({ include: { questions: true } });
    return tests.map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subject,
      totalQuestions: t.totalQuestions,
      duration: t.duration,
      questions: t.questions.map((q) => ({
        id: q.id,
        subjectId: 0,
        subject: q.subject,
        topic: q.topic,
        question: q.question,
        options: (q.options as string[]) ?? [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        difficulty: "MEDIUM",
        year: null,
        sourceExam: "",
      })),
    }));
  } catch {
    throw new InternalServerError("Failed to fetch mock tests");
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

export async function getBadges(): Promise<BadgeDTO[]> {
  try {
    const rows = await prisma.badge.findMany({ orderBy: { id: "asc" } });
    return rows.map((b) => ({
      id: b.id,
      name: b.name,
      description: b.description,
      icon: b.icon,
      rarity: b.rarity,
      unlocked: b.unlockedSeed,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch badges");
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

export async function getOfflinePacks(): Promise<OfflinePackDTO[]> {
  try {
    const rows = await prisma.offlinePack.findMany({ orderBy: { id: "asc" } });
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      size: p.size,
      downloaded: p.downloaded,
      subject: p.subject,
    }));
  } catch {
    throw new InternalServerError("Failed to fetch offline packs");
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

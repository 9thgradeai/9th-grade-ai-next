// backend/services/exam-history.ts — exam history & upcoming exams service.
// Server-only; provides per-user past attempts and upcoming scheduled exams.

import "server-only";

import { prisma } from "~backend/db";
import { InternalServerError } from "~backend/errors";
import type { ExamHistoryDTO, ExamHistoryItemDTO, UpcomingExamDTO } from "@/lib/types";

const MAX_HISTORY_ITEMS = 50;

function computeDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Fetch the user's exam history (past attempts) and upcoming exams.
 * Combines ExamAttempt (custom exams), MockTestResult (mock tests), and ExamSchedule (upcoming).
 */
export async function getExamHistory(userId: string): Promise<ExamHistoryDTO> {
  try {
    // Fetch past exam attempts (custom exams via ExamAttempt -> MockTestResult)
    const examAttempts = await prisma.examAttempt.findMany({
      where: { userId, status: "SUBMITTED" },
      orderBy: { submittedAt: "desc" },
      take: MAX_HISTORY_ITEMS,
      include: {
        result: {
          include: {
            mockTest: { select: { title: true } },
          },
        },
      },
    });

    // Fetch mock test results (standalone mock tests)
    const mockResults = await prisma.mockTestResult.findMany({
      where: { userId, mockTestId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_ITEMS,
      include: {
        mockTest: { select: { title: true, subject: true } },
      },
    });

    // Fetch daily quiz participations
    const dailyQuizResults = await prisma.dailyQuizParticipation.findMany({
      where: { userId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: MAX_HISTORY_ITEMS,
      include: {
        dailyQuiz: { select: { date: true } },
      },
    });

    // Combine and transform past attempts
    const past: ExamHistoryItemDTO[] = [];

    // Add custom exam attempts
    for (const attempt of examAttempts) {
      if (!attempt.result) continue;
      past.push({
        id: attempt.result.id,
        attemptId: attempt.idempotencyKey,
        title: attempt.result.mockTest?.title ?? "কাস্টম পরীক্ষা",
        type: "custom",
        score: attempt.result.score,
        correct: attempt.result.correct,
        total: attempt.result.total,
        durationSec: attempt.result.durationSec,
        percentage: attempt.result.score,
        createdAt: attempt.submittedAt?.toISOString() ?? attempt.startedAt.toISOString(),
        examId: undefined,
        paperId: undefined,
      });
    }

    // Add mock test results
    for (const result of mockResults) {
      past.push({
        id: result.id,
        attemptId: `mock-${result.id}`,
        title: result.mockTest?.title ?? "মক টেস্ট",
        type: "mock",
        score: result.score,
        correct: result.correct,
        total: result.total,
        durationSec: result.durationSec,
        percentage: result.score,
        createdAt: result.createdAt.toISOString(),
        subject: result.mockTest?.subject,
      });
    }

    // Add daily quiz results
    for (const result of dailyQuizResults) {
      past.push({
        id: result.id,
        attemptId: `daily-${result.id}`,
        title: `দৈনিক কুইজ (${result.dailyQuiz?.date ?? "অজানা"})`,
        type: "daily",
        score: result.score,
        correct: result.correct,
        total: result.total,
        durationSec: 0,
        percentage: result.score,
        createdAt: result.completedAt?.toISOString() ?? result.createdAt.toISOString(),
      });
    }

    // Sort past by date descending
    past.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Fetch upcoming exams (verified only, future dates)
    const upcomingRaw = await prisma.examSchedule.findMany({
      where: {
        verified: true,
        date: { gte: new Date() },
      },
      orderBy: { date: "asc" },
      take: 20,
    });

    const upcoming: UpcomingExamDTO[] = upcomingRaw.map((e) => ({
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
      daysUntil: computeDaysUntil(e.date.toISOString()),
    }));

    return { past, upcoming };
  } catch (error) {
    throw new InternalServerError("Failed to fetch exam history");
  }
}

/**
 * Get all available exam papers for the real exam feature.
 * Returns ExamPaper with full question details for PDF export.
 */
export async function getAvailableExamPapers(): Promise<Array<{
  id: number;
  titleBn: string;
  titleEn: string;
  examId: number;
  examNameBn: string;
  examNameEn: string;
  examType: string;
  year: number | null;
  heldOn: string | null;
  durationMin: number | null;
  totalQuestions: number | null;
  availableQuestions: number;
  provenance: string;
  subjectId: number | null;
  subjectNameBn: string | null;
}>> {
  try {
    const papers = await prisma.examPaper.findMany({
      where: {
        availableQuestions: { gt: 0 },
        verified: true,
      },
      orderBy: [{ exam: { categoryId: "asc" } }, { bcsTerm: "desc" }, { id: "asc" }],
      include: {
        exam: {
          include: {
            category: true,
          },
        },
        questions: {
          select: {
            id: true,
            subjectId: true,
            subject: { select: { nameBn: true } },
            topic: true,
            subtopic: true,
            question: true,
            options: true,
            correctAnswer: true,
            explanation: true,
            difficulty: true,
            year: true,
            sourceExam: true,
            questionNumber: true,
          },
          take: 200, // cap for performance
        },
      },
    });

    return papers.map((p) => ({
      id: p.id,
      titleBn: p.titleBn,
      titleEn: p.titleEn,
      examId: p.examId,
      examNameBn: p.exam.nameBn,
      examNameEn: p.exam.nameEn,
      examType: p.exam.type,
      year: p.exam.year,
      heldOn: p.exam.heldOn?.toISOString() ?? null,
      durationMin: p.durationMin,
      totalQuestions: p.totalQuestions,
      availableQuestions: p.availableQuestions,
      provenance: p.provenance,
      subjectId: p.questions[0]?.subjectId ?? null,
      subjectNameBn: p.questions[0]?.subject?.nameBn ?? null,
    }));
  } catch (error) {
    throw new InternalServerError("Failed to fetch exam papers");
  }
}

/**
 * Get questions for a specific exam paper for real exam PDF generation.
 */
export async function getRealExamQuestions(paperId: number): Promise<Array<{
  id: number;
  subjectId: number;
  subject: string;
  topic: string;
  subtopic: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  year: number | null;
  sourceExam: string;
  questionNumber: number | null;
}>> {
  try {
    const questions = await prisma.question.findMany({
      where: { paperId, examId: { not: null } },
      orderBy: { questionNumber: "asc" },
      select: {
        id: true,
        subjectId: true,
        subject: { select: { nameBn: true } },
        topic: true,
        subtopic: true,
        question: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        difficulty: true,
        year: true,
        sourceExam: true,
        questionNumber: true,
      },
    });

    return questions.map((q) => ({
      id: q.id,
      subjectId: q.subjectId,
      subject: q.subject?.nameBn ?? "",
      topic: q.topic,
      subtopic: q.subtopic,
      question: q.question,
      options: (q.options as string[]) ?? [],
      correctAnswer: q.correctAnswer ?? "",
      explanation: q.explanation ?? "",
      difficulty: q.difficulty as "EASY" | "MEDIUM" | "HARD",
      year: q.year,
      sourceExam: q.sourceExam ?? "",
      questionNumber: q.questionNumber,
    }));
  } catch (error) {
    throw new InternalServerError("Failed to fetch real exam questions");
  }
}
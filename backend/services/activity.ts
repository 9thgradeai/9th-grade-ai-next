// backend/services/activity.ts — per-user activity recording.
// Grades submitted answers, persists attempts, and updates UserProgress.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";

export type SubmittedAnswer = {
  questionId: number;
  selected: string;
};

export type SubmissionSummary = {
  correct: number;
  total: number;
  score: number; // percentage 0-100
  pointsEarned: number;
};

const POINTS_PER_CORRECT = 10;

// Recompute accuracy + questionsAnswered straight from the attempt log so the
// stored percentage never drifts from the underlying records.
async function recomputeProgress(userId: string, pointsEarned: number) {
  const [total, correctCount] = await Promise.all([
    prisma.questionAttempt.count({ where: { userId } }),
    prisma.questionAttempt.count({ where: { userId, correct: true } }),
  ]);

  await prisma.userProgress.update({
    where: { userId },
    data: {
      questionsAnswered: total,
      accuracy: total > 0 ? Math.round((correctCount / total) * 100) : 0,
      points: { increment: pointsEarned },
    },
  });
}

async function ensureProgress(userId: string) {
  return prisma.userProgress.upsert({ where: { userId }, update: {}, create: { userId } });
}

function gradeAnswers(
  answers: SubmittedAnswer[],
  reference: Array<{ id: number; correctAnswer: string }>,
): { correct: number; total: number } {
  if (!Array.isArray(answers)) {
    throw new AppError(400, "answers must be an array.", "VALIDATION_ERROR");
  }
  // The runtime payload may contain malformed entries; validate defensively.
  const raw = answers as Array<Partial<SubmittedAnswer> | null>;
  const byId = new Map(reference.map((q) => [q.id, q.correctAnswer]));
  let correct = 0;
  for (const a of raw) {
    if (!a || !Number.isInteger(a.questionId) || typeof a.selected !== "string") {
      throw new AppError(400, "Each answer needs a numeric questionId and a selected string.", "VALIDATION_ERROR");
    }
    const right = byId.get(a.questionId as number);
    if (right === undefined) {
      throw new AppError(400, `Unknown questionId ${a.questionId}.`, "VALIDATION_ERROR");
    }
    if (a.selected.trim() === right.trim()) correct += 1;
  }
  return { correct, total: answers.length };
}

// ── Practice (Question table) ─────────────────────────────
export async function submitPracticeAnswers(
  userId: string,
  answers: SubmittedAnswer[],
): Promise<SubmissionSummary> {
  try {
    const ids = answers.map((a) => a.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: ids } },
      select: { id: true, correctAnswer: true, subjectId: true, topic: true, subject: { select: { nameBn: true } } },
    });
    const { correct, total } = gradeAnswers(answers, questions);
    const byId = new Map(questions.map((q) => [q.id, q]));

    await prisma.questionAttempt.createMany({
      data: answers.map((a) => {
        const q = byId.get(a.questionId);
        return {
          userId,
          questionId: a.questionId,
          subjectId: q?.subjectId ?? null,
          subjectName: q?.subject ? q.subject.nameBn : "",
          topic: q?.topic ?? "",
          correct: a.selected.trim() === q?.correctAnswer.trim(),
          source: "practice",
        };
      }),
    });

    const pointsEarned = correct * POINTS_PER_CORRECT;
    await recomputeProgress(userId, pointsEarned);
    return { correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0, pointsEarned };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record practice answers");
  }
}

// ── Mock tests (MockTestQuestion table) ───────────────────
export async function submitMockTestResult(
  userId: string,
  mockTestId: number,
  answers: SubmittedAnswer[],
  durationSec = 0,
): Promise<SubmissionSummary & { resultId: number }> {
  try {
    const test = await prisma.mockTest.findUnique({
      where: { id: mockTestId },
      include: { questions: { select: { id: true, correctAnswer: true, subject: true, topic: true } } },
    });
    if (!test) {
      throw new AppError(404, "Mock test not found.", "NOT_FOUND");
    }

    const { correct, total } = gradeAnswers(answers, test.questions);
    const byId = new Map(test.questions.map((q) => [q.id, q]));

    const result = await prisma.mockTestResult.create({
      data: {
        userId,
        mockTestId: test.id,
        score: total > 0 ? Math.round((correct / total) * 100) : 0,
        correct,
        total,
        durationSec,
      },
    });

    await prisma.questionAttempt.createMany({
      data: answers.map((a) => {
        const q = byId.get(a.questionId);
        return {
          userId,
          questionId: null,
          subjectId: null,
          subjectName: q?.subject ?? "",
          topic: q?.topic ?? "",
          correct: a.selected.trim() === q?.correctAnswer.trim(),
          source: "mock",
        };
      }),
    });

    const pointsEarned = correct * POINTS_PER_CORRECT;
    await recomputeProgress(userId, pointsEarned);
    await prisma.userProgress.update({ where: { userId }, data: { examsAttempted: { increment: 1 } } });

    return {
      correct,
      total,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
      pointsEarned,
      resultId: result.id,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record mock test result");
  }
}

// ── Daily quiz (QuizQuestion table) ───────────────────────
export async function submitDailyQuiz(
  userId: string,
  quizId: number,
  answers: SubmittedAnswer[],
): Promise<SubmissionSummary> {
  try {
    const quiz = await prisma.dailyQuiz.findUnique({
      where: { id: quizId },
      include: { questions: { select: { id: true, correctAnswer: true, subject: true, topic: true } } },
    });
    if (!quiz) {
      throw new AppError(404, "Daily quiz not found.", "NOT_FOUND");
    }

    const { correct, total } = gradeAnswers(answers, quiz.questions);
    const byId = new Map(quiz.questions.map((q) => [q.id, q]));

    await prisma.questionAttempt.createMany({
      data: answers.map((a) => {
        const q = byId.get(a.questionId);
        return {
          userId,
          questionId: null,
          subjectId: null,
          subjectName: q?.subject ?? "",
          topic: q?.topic ?? "",
          correct: a.selected.trim() === q?.correctAnswer.trim(),
          source: "daily",
        };
      }),
    });

    const pointsEarned = correct * POINTS_PER_CORRECT;
    await recomputeProgress(userId, pointsEarned);
    return { correct, total, score: total > 0 ? Math.round((correct / total) * 100) : 0, pointsEarned };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record daily quiz");
  }
}

// ── Flashcards (SRS) ──────────────────────────────────────
export async function submitFlashcardReview(
  userId: string,
  flashcardId: number,
  rating: number,
): Promise<{ reviewed: boolean; flashcardsReviewed: number }> {
  try {
    if (!Number.isInteger(flashcardId)) {
      throw new AppError(400, "flashcardId must be an integer.", "VALIDATION_ERROR");
    }
    if (!Number.isInteger(rating) || rating < 0 || rating > 3) {
      throw new AppError(400, "rating must be an integer 0-3.", "VALIDATION_ERROR");
    }
    const flashcard = await prisma.flashcard.findUnique({ where: { id: flashcardId } });
    if (!flashcard) {
      throw new AppError(404, "Flashcard not found.", "NOT_FOUND");
    }

    await prisma.flashcardReview.create({ data: { userId, flashcardId, rating } });
    const updated = await prisma.userProgress.update({
      where: { userId },
      data: { flashcardsReviewed: { increment: 1 } },
    });
    return { reviewed: true, flashcardsReviewed: updated.flashcardsReviewed };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record flashcard review");
  }
}

// ── Notifications (read markers) ──────────────────────────
export async function markNotificationRead(
  userId: string,
  notificationId: number,
): Promise<{ read: boolean }> {
  try {
    const notification = await prisma.appNotification.findUnique({ where: { id: notificationId } });
    if (!notification) {
      throw new AppError(404, "Notification not found.", "NOT_FOUND");
    }
    await prisma.notificationRead.upsert({
      where: { userId_notificationId: { userId, notificationId } },
      update: {},
      create: { userId, notificationId },
    });
    return { read: true };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to mark notification read");
  }
}

export { ensureProgress };
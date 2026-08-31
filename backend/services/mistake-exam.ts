// backend/services/mistake-exam.ts — builds mistake practice exams.
// Reuses the existing exam engine infrastructure (shuffleWithSeed, fetchQuestionsByIds)
// but selects questions from the user's mistake pool.
// Server-only; called from API route handlers with an authenticated userId.

import "server-only";

import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";
import { shuffleWithSeed } from "./exam";
import {
  getMistakeQuestionIds,
  getCrossSubjectMistakeIds,
  getMistakeQuestionIdsBySelection,
} from "~backend/repositories/question-progress.repository";
import { scoreMistakeQuestions } from "./question-progress";
import type { ExamQuestionDTO, ExamBuildResultDTO } from "@/lib/types";

export type MistakeExamConfig = {
  subject?: string; // undefined = all subjects
  topic?: string; // optional topic preference (over the mistake pool)
  subtopic?: string; // optional subtopic preference (over the mistake pool)
  count: number; // number of questions
  difficulty?: string;
  focus?: string; // most_wrong | recently_wrong | weakest_topics | due_for_review | random
  durationSec?: number;
};

/** Maximum questions per mistake exam. */
export const MISTAKE_EXAM_MAX = 100;
/** Minimum questions per mistake exam. */
export const MISTAKE_EXAM_MIN = 1;

function validateMistakeExamConfig(config: MistakeExamConfig) {
  if (!config || typeof config !== "object") {
    throw new AppError(400, "Invalid mistake exam configuration.", "VALIDATION_ERROR");
  }
  if (
    !Number.isInteger(config.count) ||
    config.count < MISTAKE_EXAM_MIN ||
    config.count > MISTAKE_EXAM_MAX
  ) {
    throw new AppError(
      400,
      `count must be between ${MISTAKE_EXAM_MIN} and ${MISTAKE_EXAM_MAX}.`,
      "VALIDATION_ERROR",
    );
  }
  return {
    subject: config.subject ?? "",
    topic: config.topic ?? "",
    subtopic: config.subtopic ?? "",
    count: config.count,
    difficulty: config.difficulty ?? "",
    focus: config.focus ?? "most_wrong",
    durationSec: config.durationSec ?? 0,
  };
}

/**
 * Build a mistake practice exam. Selects questions from the user's mistake
 * pool, prioritized by frequency, recency, and mastery score.
 */
export async function buildMistakeExam(
  userId: string,
  config: MistakeExamConfig,
): Promise<ExamBuildResultDTO> {
  const validated = validateMistakeExamConfig(config);

  try {
    let questionIds: number[];

    // When the caller expresses a subject/topic/subtopic preference, draw
    // strictly from the user's mistake pool that matches that preference.
    // Otherwise fall back to the existing subject-only or cross-subject paths.
    if (validated.topic || validated.subtopic) {
      const rows = await getMistakeQuestionIdsBySelection(
        userId,
        {
          subject: validated.subject || undefined,
          topic: validated.topic || undefined,
          subtopic: validated.subtopic || undefined,
          difficulty: validated.difficulty || undefined,
        },
        validated.count,
        validated.focus,
      );
      const scored = scoreMistakeQuestions(rows);
      questionIds = scored.slice(0, validated.count).map((s) => s.questionId);
    } else if (validated.subject) {
      // Subject-specific mistake exam
      const rows = await getMistakeQuestionIds(userId, {
        subject: validated.subject,
        difficulty: validated.difficulty,
        limit: validated.count,
        focus: validated.focus,
      });
      const scored = scoreMistakeQuestions(rows);
      questionIds = scored.slice(0, validated.count).map((s) => s.questionId);
    } else {
      // Cross-subject mistake exam
      const ids = await getCrossSubjectMistakeIds(userId, validated.count);
      questionIds = ids.slice(0, validated.count);
    }

    if (questionIds.length === 0) {
      throw new AppError(404, "No mistakes found to practice.", "NOT_FOUND");
    }

    // Fetch full question data
    const rows = await prisma.question.findMany({
      where: { id: { in: questionIds } },
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
        subject: { select: { nameBn: true } },
      },
    });

    const byId = new Map(rows.map((r) => [r.id, r]));
    const questions: ExamQuestionDTO[] = questionIds
      .map((id) => {
        const q = byId.get(id);
        if (!q) return null;
        return {
          id: q.id,
          subjectId: q.subjectId,
          subject: q.subject?.nameBn ?? "",
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

    const seed = Date.now();
    const ordered = shuffleWithSeed(questions, seed);

    const examId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `mistake-exam-${Date.now()}-${seed}`;

    return {
      examId,
      questions: ordered,
      totalQuestions: ordered.length,
      requested: validated.count,
      available: questionIds.length,
      shortfall: Math.max(0, validated.count - ordered.length),
      durationSec: validated.durationSec,
      config: {
        subjects: validated.subject
          ? [{ subjectId: rows[0]?.subjectId ?? 0, paths: [], count: validated.count }]
          : [],
        questionCount: validated.count,
        durationSec: validated.durationSec,
      },
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to build mistake exam");
  }
}

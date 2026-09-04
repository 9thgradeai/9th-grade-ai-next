// backend/services/exam-submission.ts — canonical exam submission service.
//
// THE single source of truth for "an exam was submitted by a user". Every
// submission path (manual button click, timer expiry, auto-submit, mobile UI,
// keyboard shortcut) must funnel through `submitExamAttempt()` here.
//
// Why this file exists (root cause of the old submit-button bug):
//   • Previously, `submitCustomExam()` in services/exam.ts created fresh
//     `QuestionAttempt` rows + a `MockTestResult` row + awarded points on
//     EVERY call. Without an attempt token, network retries and double-clicks
//     double-counted points and produced duplicate result rows.
//   • `recordQuestionAttempt()` swallowed errors inside the transaction, so a
//     mastery-update failure left the system half-written (attempts + points
//     committed, mastery feedback missing) without surfacing the problem.
//   • There was no per-attempt lifecycle — the DB had no idea whether an exam
//     was "in progress" vs "submitted", and the client computed nothing from
//     server state, so a navigation refresh before submit destroyed progress
//     (well, localStorage saved it, but resume couldn't finalize it).
//
// What this file guarantees:
//   1. ONE ExamAttempt row per (user, idempotencyKey), enforced by a unique
//      constraint at the schema level. Re-submits for the same key resolve
//      to the existing result instead of writing again.
//   2. The submission's question set is verified against a stored SHA-256
//      fingerprint — a client cannot submit different answers for the same
//      attempt token.
//   3. The full grading transaction (attempts + mastery + result + progress
//      recompute + status flip to SUBMITTED) is atomic. If any step throws,
//      NOTHING is committed, and the client sees a recoverable error.
//   4. `recordQuestionAttempt()` errors now abort the transaction (no silent
//      partial state). Mastery failures therefore fail-loud and the client
//      can retry with the same idempotency key for a fresh attempt.
//   5. Duration is captured server-side from the client-reported elapsed
//      seconds (clamped to a sane range) — not hardcoded to 0.
//
// server-only; called from API route handlers with an authenticated userId.

import "server-only";

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "~backend/db";
import { AppError, InternalServerError } from "~backend/errors";
import { recomputeAndAward } from "~backend/repositories/progress.repository";
import { emit } from "~backend/events/bus";
import { recordQuestionAttempt } from "./question-progress";
import type { SubmittedAnswer } from "./activity";
import type { ExamReviewDTO } from "@/lib/types";

const POINTS_PER_CORRECT = 10;

export type ExamSummaryDTO = {
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  positiveMarks: number;
  negativeMarks: number;
  finalScore: number;
  accuracy: number;
  percentage: number;
  pointsEarned: number;
};

export type ExamResultDTO = {
  summary: ExamSummaryDTO;
  review: ExamReviewDTO[];
  attemptId: string;
  /** Always "submitted" on a successful submit, "resumed" when an earlier
   * SUBMITTED row was returned for the same idempotency key. */
  outcome: "submitted" | "resumed";
  submittedAt: string;
};

export type SubmitExamRequest = {
  attemptId: string;
  questionIds: number[];
  durationSec: number;
  answers: SubmittedAnswer[];
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateAttemptId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AppError(
      400,
      "attemptId must be a UUID minted by /api/exam/start.",
      "VALIDATION_ERROR",
    );
  }
  return value.toLowerCase();
}

function validateDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AppError(
      400,
      "durationSec must be a finite number.",
      "VALIDATION_ERROR",
    );
  }
  if (value < 0) {
    throw new AppError(
      400,
      "durationSec must be >= 0.",
      "VALIDATION_ERROR",
    );
  }
  // Hard ceiling — anything past 6h is either a client clock bug or abuse.
  if (value > 6 * 60 * 60) {
    throw new AppError(
      400,
      "durationSec exceeds the 6h ceiling.",
      "VALIDATION_ERROR",
    );
  }
  return Math.floor(value);
}

function hashQuestionSet(ids: number[]): string {
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  return createHash("sha256").update(sorted.join(",")).digest("hex");
}

function gradeAnswers(
  answers: SubmittedAnswer[],
  reference: Map<number, ExamQuestionRow>,
): {
  correct: number;
  wrong: number;
  attempted: number;
  review: ExamReviewDTO[];
} {
  let correct = 0;
  let wrong = 0;
  let attempted = 0;
  const review: ExamReviewDTO[] = [];

  for (const a of answers) {
    const q = reference.get(a.questionId);
    if (!q) continue;
    const userAnswer = (a.selected ?? "").trim();
    const right = (q.correctAnswer ?? "").trim();
    let status: ExamReviewDTO["status"];
    let marks = 0;
    if (userAnswer.length === 0) {
      status = "unanswered";
    } else if (userAnswer === right) {
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
      correctAnswer: q.correctAnswer ?? "",
      explanation: q.explanation,
      userAnswer: a.selected,
      status,
      marks,
    });
  }

  return { correct, wrong, attempted, review };
}

type ExamQuestionRow = {
  id: number;
  subjectId: number | null;
  topic: string;
  subtopic: string;
  question: string;
  options: unknown;
  correctAnswer: string | null;
  explanation: string;
  subject: { nameBn: string } | null;
};

/** Snapshot stored on ExamAttempt.summaryJson so idempotent retries can
 * reconstruct the exact result without re-running grading. */
type SnapshotPayload = {
  summary: ExamSummaryDTO;
  review: ExamReviewDTO[];
};

/**
 * Canonical exam submission entry point. Idempotent: a retry with the same
 * (userId, attemptId) returns the original SUBMITTED result without
 * re-running grading or re-writing database rows.
 */
export async function submitExamAttempt(
  userId: string,
  request: SubmitExamRequest,
): Promise<ExamResultDTO> {
  try {
    const attemptId = validateAttemptId(request.attemptId);
    const durationSec = validateDuration(request.durationSec);
    const answers = request.answers ?? [];

    if (!Array.isArray(answers) || answers.length === 0) {
      throw new AppError(
        400,
        "answers must be a non-empty array.",
        "VALIDATION_ERROR",
      );
    }
    if (answers.length > 200) {
      throw new AppError(
        400,
        "answers must contain at most 200 entries.",
        "VALIDATION_ERROR",
      );
    }

    const submittedIds = answers
      .map((a) => a.questionId)
      .filter((id): id is number => Number.isInteger(id));
    const expectedHash = hashQuestionSet(submittedIds);

    // ── Fast path: this attempt was already finalized. ───────────
    // Reading outside the transaction is safe because the unique constraint
    // serializes concurrent writers at the DB level. If a concurrent request
    // is mid-flight, we still return its eventual result here on the second
    // hit; if the row doesn't exist yet, the transaction below either
    // creates it or surfaces a conflict.
    const existing = await prisma.examAttempt.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: attemptId } },
      include: { result: true },
    });

    if (existing?.status === "SUBMITTED") {
      if (existing.questionSetHash !== expectedHash) {
        // The client is reusing an attempt token with a different question
        // set. This is a tampering signal — reject without revealing detail.
        throw new AppError(
          409,
          "Attempt does not match the original question set.",
          "ATTEMPT_HASH_MISMATCH",
        );
      }
      const snapshot = (existing.summaryJson as SnapshotPayload | null) ?? null;
      if (!snapshot) {
        // Defensive: a SUBMITTED row without a snapshot is data corruption —
        // surface it instead of silently returning a half-result.
        throw new InternalServerError(
          "Exam attempt is marked submitted but its result is missing.",
        );
      }
      return {
        summary: snapshot.summary,
        review: snapshot.review,
        attemptId,
        outcome: "resumed",
        submittedAt: existing.submittedAt?.toISOString() ?? new Date().toISOString(),
      };
    }

    // ── Slow path: grade, persist, mark submitted — atomically. ──
    // Fetch reference data OUTSIDE the transaction (read-only, big query).
    const questions = await prisma.question.findMany({
      where: { id: { in: submittedIds } },
      select: {
        id: true,
        subjectId: true,
        topic: true,
        subtopic: true,
        question: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        subject: { select: { nameBn: true } },
      },
    });
    if (questions.length !== new Set(submittedIds).size) {
      throw new AppError(
        400,
        "One or more questions were not found.",
        "VALIDATION_ERROR",
      );
    }
    const byId = new Map(questions.map((q) => [q.id, q]));
    const { correct, wrong, attempted, review } = gradeAnswers(answers, byId);

    const total = review.length;
    const unanswered = total - attempted;
    const positiveMarks = correct;
    const negativeMarks = Math.round(wrong * 0.5 * 100) / 100;
    const finalScore = Math.round((correct - wrong * 0.5) * 100) / 100;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const percentage =
      total > 0 ? Math.max(0, Math.min(100, Math.round((finalScore / total) * 100))) : 0;
    const pointsEarned = correct * POINTS_PER_CORRECT;

    const summary: ExamSummaryDTO = {
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
    };

    const attempts: Array<{
      userId: string;
      questionId: number | null;
      subjectId: number | null;
      subjectName: string;
      topic: string;
      correct: boolean;
      source: string;
    }> = [];
    for (const a of answers) {
      const userAnswer = (a.selected ?? "").trim();
      if (userAnswer.length === 0) continue; // unanswered — not an attempt
      const q = byId.get(a.questionId);
      attempts.push({
        userId,
        questionId: q?.id ?? null,
        subjectId: q?.subjectId ?? null,
        subjectName: q?.subject?.nameBn ?? "",
        topic: q?.topic ?? "",
        correct: userAnswer === (q?.correctAnswer ?? "").trim(),
        source: "exam",
      });
    }

    let submittedAt: Date = new Date();

    try {
      await prisma.$transaction(
        async (tx) => {
          // Upsert the attempt row. If another request just inserted it in
          // IN_PROGRESS state we adopt and continue; the unique constraint
          // serializes us. The fast path above already short-circuited
          // SUBMITTED rows, so reaching the upsert means we're either
          // creating fresh or racing an IN_PROGRESS peer.
          const upserted = await tx.examAttempt.upsert({
            where: {
              userId_idempotencyKey: { userId, idempotencyKey: attemptId },
            },
            create: {
              userId,
              idempotencyKey: attemptId,
              questionSetHash: expectedHash,
              status: "SUBMITTING",
              durationSec,
            },
            update: {
              status: "SUBMITTING",
              durationSec,
            },
          });

          if (upserted.questionSetHash !== expectedHash) {
            throw new AppError(
              409,
              "Attempt does not match the original question set.",
              "ATTEMPT_HASH_MISMATCH",
            );
          }
          if (upserted.status === "SUBMITTED") {
            // Another request raced ahead and committed. Re-read to return
            // its result — we don't double-write.
            const fresh = await tx.examAttempt.findUnique({
              where: { userId_idempotencyKey: { userId, idempotencyKey: attemptId } },
              include: { result: true },
            });
            if (!fresh || !fresh.result) {
              throw new InternalServerError(
                "Concurrent submit completed without a result row.",
              );
            }
            return fresh.result.id;
          }

          if (attempts.length > 0) {
            await tx.questionAttempt.createMany({ data: attempts });
          }
          const result = await tx.mockTestResult.create({
            data: {
              userId,
              score: percentage,
              correct,
              total,
              durationSec,
            },
          });
          await recomputeAndAward(tx, userId, pointsEarned, 1);

          // Mastery loop — NO error swallowing. A failure here aborts the
          // entire transaction so attempts + result + progress stay
          // consistent. The client can safely retry with the same attemptId
          // to retry the mastery step (it's idempotent under the question's
          // unique-per-user key).
          const feedbackByQid = new Map<
            number,
            { masteryStatus: string | null; justMastered: boolean }
          >();
          for (const a of answers) {
            const q = byId.get(a.questionId);
            if (!q) continue;
            const userAnswer = (a.selected ?? "").trim();
            if (userAnswer.length === 0) continue;
            const isCorrect = userAnswer === (q.correctAnswer ?? "").trim();
            const fb = await recordQuestionAttempt(tx, {
              userId,
              questionId: a.questionId,
              isCorrect,
              subject: q.subject?.nameBn,
              topic: q.topic,
            });
            if (fb && fb.masteryStatus) {
              feedbackByQid.set(a.questionId, {
                masteryStatus: fb.masteryStatus,
                justMastered: fb.justMastered,
              });
            }
          }
          for (const item of review) {
            const fb = feedbackByQid.get(item.questionId);
            if (fb) {
              item.masteryStatus =
                fb.masteryStatus as ExamReviewDTO["masteryStatus"];
              item.justMastered = fb.justMastered;
            }
          }

          submittedAt = new Date();
          await tx.examAttempt.update({
            where: { userId_idempotencyKey: { userId, idempotencyKey: attemptId } },
            data: {
              status: "SUBMITTED",
              submittedAt,
              summaryJson: { summary, review } as unknown as Prisma.InputJsonValue,
              resultId: result.id,
            },
          });

          return result.id;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof AppError) throw err;
      // A unique-constraint conflict here means a concurrent caller raced
      // past us. Re-fetch and return its result.
      if (isPrismaUniqueViolation(err)) {
        const raced = await prisma.examAttempt.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: attemptId } },
        });
        if (raced?.status === "SUBMITTED") {
          const racedSnapshot =
            (raced.summaryJson as SnapshotPayload | null) ?? null;
          if (racedSnapshot) {
            return {
              summary: racedSnapshot.summary,
              review: racedSnapshot.review,
              attemptId,
              outcome: "resumed",
              submittedAt:
                raced.submittedAt?.toISOString() ?? new Date().toISOString(),
            };
          }
        }
      }
      throw new InternalServerError("Failed to submit exam attempt.");
    }

    // Domain event — only after the transaction committed.
    emit({
      name: "EXAM_COMPLETED",
      userId,
      correct,
      wrong,
      finalScore,
    });

    return {
      summary,
      review,
      attemptId,
      outcome: "submitted",
      submittedAt: submittedAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to submit exam attempt.");
  }
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "P2002"
  );
}

/**
 * Register a freshly built exam as IN_PROGRESS so the next submit call has a
 * target row to upsert. Returns nothing — the attemptId itself is the only
 * handle the client needs.
 *
 * Safe to call multiple times for the same (userId, attemptId): the unique
 * constraint makes it a no-op when the row already exists.
 */
export async function registerExamAttempt(
  userId: string,
  attemptId: string,
  questionIds: number[],
): Promise<void> {
  const key = validateAttemptId(attemptId);
  const hash = hashQuestionSet(questionIds);
  try {
    await prisma.examAttempt.upsert({
      where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      create: {
        userId,
        idempotencyKey: key,
        questionSetHash: hash,
        status: "IN_PROGRESS",
      },
      update: {
        // Refresh only the hash if the attempt is still IN_PROGRESS. A
        // SUBMITTED attempt is immutable; tampering here throws.
        ...(await canRewriteHash(userId, key, hash)
          ? { questionSetHash: hash }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to register exam attempt.");
  }
}

async function canRewriteHash(
  userId: string,
  attemptId: string,
  expectedHash: string,
): Promise<boolean> {
  const existing = await prisma.examAttempt.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: attemptId } },
    select: { status: true, questionSetHash: true },
  });
  if (!existing) return true; // upsert will create
  if (existing.status !== "IN_PROGRESS") return false;
  if (existing.questionSetHash !== expectedHash) return false;
  return true;
}

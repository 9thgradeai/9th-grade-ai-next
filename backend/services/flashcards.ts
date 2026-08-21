// backend/services/flashcards.ts — per-user SRS (SM-2) review flow.
// Server-only; called from API route handlers with an authenticated userId.
// Shared Flashcard rows hold content only — all scheduling state is
// per-user (FlashcardUserState), so learners never affect each other.

import "server-only";

import { prisma } from "~backend/db";
import { AppError, InternalServerError, NotFoundError } from "~backend/errors";
import { emit } from "~backend/events/bus";

export type FlashcardRating = 0 | 1 | 2 | 3; // again | hard | good | easy

export type Sm2State = {
  interval: number; // days
  easeFactor: number;
  repetitions: number;
  lapses: number;
};

const MIN_EASE = 1.3;

// SM-2 quality mapping for the 4-button UI.
function ratingToQuality(r: FlashcardRating): number {
  switch (r) {
    case 0:
      return 1; // again — fail
    case 1:
      return 3; // hard
    case 2:
      return 4; // good
    case 3:
      return 5; // easy
  }
}

/**
 * Pure SM-2 transition. Exported for unit tests.
 * `state` describes the card's scheduling BEFORE this review.
 */
export function gradeSm2(state: Sm2State, rating: FlashcardRating): Sm2State & { nextReview: Date } {
  const q = ratingToQuality(rating);
  let { interval, easeFactor, repetitions, lapses } = state;

  if (q < 3) {
    repetitions = 0;
    interval = 1;
    lapses += 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easeFactor);
  }

  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < MIN_EASE) easeFactor = MIN_EASE;

  const nextReview = new Date(Date.now() + interval * 86_400_000);
  return { interval, easeFactor: Math.round(easeFactor * 100) / 100, repetitions, lapses, nextReview };
}

export async function submitFlashcardReview(
  userId: string,
  flashcardId: number,
  rating: FlashcardRating,
): Promise<{
  flashcardId: number;
  nextReview: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
}> {
  try {
    const card = await prisma.flashcard.findUnique({
      where: { id: flashcardId },
      select: { id: true },
    });
    if (!card) throw new NotFoundError("Flashcard not found");

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.flashcardUserState.findUnique({
        where: { userId_flashcardId: { userId, flashcardId } },
      });

      const current: Sm2State = existing
        ? {
            interval: existing.interval,
            easeFactor: existing.easeFactor,
            repetitions: existing.repetitions,
            lapses: existing.lapses,
          }
        : { interval: 1, easeFactor: 2.5, repetitions: 0, lapses: 0 };

      const graded = gradeSm2(current, rating);

      await tx.flashcardUserState.upsert({
        where: { userId_flashcardId: { userId, flashcardId } },
        update: {
          interval: graded.interval,
          easeFactor: graded.easeFactor,
          repetitions: graded.repetitions,
          lapses: graded.lapses,
          lastRating: rating,
          nextReview: graded.nextReview,
        },
        create: {
          userId,
          flashcardId,
          interval: graded.interval,
          easeFactor: graded.easeFactor,
          repetitions: graded.repetitions,
          lapses: graded.lapses,
          lastRating: rating,
          nextReview: graded.nextReview,
        },
      });

      // Review log row — the audit trail behind future analytics.
      await tx.flashcardReview.create({
        data: { userId, flashcardId, rating },
      });

      return graded;
    });

    emit({ name: "FLASHCARD_REVIEWED", userId, flashcardId, rating });

    return {
      flashcardId,
      nextReview: result.nextReview.toISOString(),
      interval: result.interval,
      easeFactor: result.easeFactor,
      repetitions: result.repetitions,
      lapses: result.lapses,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to record flashcard review");
  }
}

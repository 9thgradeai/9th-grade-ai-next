// backend/events/notification-subscriber.ts — creates notifications from domain events.
// Subscribes to practice, exam, quiz, flashcard, and AI events.

import "server-only";

import { createNotification } from "~backend/services/notification";
import type { DomainEvent } from "./types";

export async function createNotificationsForEvent(event: DomainEvent): Promise<void> {
  try {
    switch (event.name) {
      case "PRACTICE_SUBMITTED": {
        const pct = event.total > 0 ? Math.round((event.correct / event.total) * 100) : 0;
        if (pct >= 80) {
          await createNotification({
            userId: event.userId,
            title: "Great Practice Score!",
            message: `You scored ${pct}% on your practice session (${event.correct}/${event.total}). Keep it up!`,
            type: "SUCCESS",
            sourceKey: `practice-${event.userId}-${Date.now()}`,
          });
        } else if (pct < 40) {
          await createNotification({
            userId: event.userId,
            title: "Keep Practicing!",
            message: `You scored ${pct}% on your practice session. Review your weak areas and try again.`,
            type: "REMINDER",
            sourceKey: `practice-weak-${event.userId}-${Date.now()}`,
          });
        }
        break;
      }

      case "EXAM_COMPLETED": {
        const pct = event.correct + event.wrong > 0
          ? Math.round((event.correct / (event.correct + event.wrong)) * 100)
          : 0;
        await createNotification({
          userId: event.userId,
          title: "Exam Completed!",
          message: `You scored ${pct}% on your mock exam (${event.correct} correct, ${event.wrong} wrong).`,
          type: pct >= 60 ? "SUCCESS" : "INFO",
          sourceKey: `exam-${event.userId}-${Date.now()}`,
        });
        break;
      }

      case "DAILY_QUIZ_COMPLETED": {
        const pct = event.score;
        await createNotification({
          userId: event.userId,
          title: "Daily Quiz Complete!",
          message: `You scored ${pct}% on today's daily quiz. ${pct >= 70 ? "Excellent work!" : "Review the explanations to improve."}`,
          type: pct >= 70 ? "SUCCESS" : "INFO",
          sourceKey: `daily-quiz-${event.userId}-${Date.now()}`,
        });
        break;
      }

      case "FLASHCARD_REVIEWED": {
        // Only notify on first review of the day (rating 1 = Again means struggling)
        if (event.rating === 1) {
          await createNotification({
            userId: event.userId,
            title: "Flashcard Needs Review",
            message: "You have flashcards that need more practice. Review them again later.",
            type: "REMINDER",
            sourceKey: `flashcard-again-${event.userId}-${Date.now()}`,
          });
        }
        break;
      }

      case "AI_TUTOR_TURN": {
        // Notify on first AI tutor interaction of the day
        if (event.kind === "tutor") {
          await createNotification({
            userId: event.userId,
            title: "AI Tutor Session",
            message: `You had a tutoring session on ${event.intent}. Keep exploring to strengthen your understanding.`,
            type: "INFO",
            sourceKey: `ai-tutor-${event.userId}-${Date.now()}`,
          });
        }
        break;
      }
    }
  } catch {
    // Notification creation is best-effort — never break the event pipeline
  }
}

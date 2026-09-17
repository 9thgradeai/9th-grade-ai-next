// backend/events/subscribers.ts — wires domain events to their consumers.
// Imported once at server startup via instrumentation.ts. The globalThis
// guard keeps registration idempotent under dev HMR / multiple imports.

import "server-only";

import { subscribe } from "./bus";
import { evaluateBadgesForEvent } from "~backend/services/badges";
import { recordLearningEventsForEvent } from "./learning-events";

const GLOBAL_KEY = "__9th_grade_ai_subscribers_registered__";

export function registerSubscribers(): void {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: boolean };
  if (g[GLOBAL_KEY]) return;
  g[GLOBAL_KEY] = true;

  for (const name of [
    "PRACTICE_SUBMITTED",
    "EXAM_COMPLETED",
    "DAILY_QUIZ_COMPLETED",
    "FLASHCARD_REVIEWED",
    "AI_TUTOR_TURN",
  ] as const) {
    subscribe(name, (event) => evaluateBadgesForEvent(event));
    subscribe(name, recordLearningEventsForEvent);
  }
}

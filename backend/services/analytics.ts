// backend/services/analytics.ts — reporting read models.
// Server-only. Route handlers delegate here; data access goes through
// backend/repositories/analytics.repository.ts.

import "server-only";

import {
  aggregateAttemptsBySubject,
  aggregateAttemptsBySubjectTopic,
  fetchSubjectsOrdered,
} from "~backend/repositories/analytics.repository";
import { InternalServerError } from "~backend/errors";

export type SubjectReport = {
  name: string;
  score: number;
  attempted: number;
  correct: number;
};

export type WeakTopic = {
  subject: string;
  topic: string;
  attempted: number;
  correct: number;
  score: number;
};

/**
 * Per-subject performance for the requesting user, computed from real
 * QuestionAttempt aggregates. Subjects with no attempts report honest zeros —
 * nothing is fabricated.
 */
export async function getSubjectReports(userId: string): Promise<SubjectReport[]> {
  try {
    const [subjects, aggregates] = await Promise.all([
      fetchSubjectsOrdered(),
      aggregateAttemptsBySubject(userId),
    ]);

    const bySubject = new Map<string, { attempted: number; correct: number }>();
    for (const a of aggregates) {
      const key = a.subjectName || "অন্যান্য";
      bySubject.set(key, { attempted: a.attempted, correct: a.correct });
    }

    return subjects.map((s) => {
      const entry = bySubject.get(s.nameBn);
      const attempted = entry?.attempted ?? 0;
      const correct = entry?.correct ?? 0;
      const score = attempted > 0 ? Math.min(100, Math.round((correct / attempted) * 100)) : 0;
      return { name: s.nameBn, score, attempted, correct };
    });
  } catch {
    throw new InternalServerError("Failed to build subject reports");
  }
}

/**
 * Topics the user struggles with most: lowest accuracy (descending), only
 * counting topics with enough attempts to be meaningful. Powers the weak-topic
 * report / "practice your weak spots" surfacing.
 */
export async function getWeakTopics(
  userId: string,
  opts?: { minAttempts?: number; limit?: number },
): Promise<WeakTopic[]> {
  try {
    const minAttempts = opts?.minAttempts ?? 3;
    const limit = Math.min(50, Math.max(1, opts?.limit ?? 8));

    const rows = await aggregateAttemptsBySubjectTopic(userId);

    return rows
      .filter((r) => r.attempted >= minAttempts && r.topic.length > 0)
      .map((r) => ({
        subject: r.subjectName || "অন্যান্য",
        topic: r.topic,
        attempted: r.attempted,
        correct: r.correct,
        score: Math.round((r.correct / r.attempted) * 100),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  } catch {
    throw new InternalServerError("Failed to build weak-topic report");
  }
}

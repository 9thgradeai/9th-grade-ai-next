// backend/services/analytics.ts — reporting read models.
// Server-only. Route handlers delegate here; data access goes through
// backend/repositories/analytics.repository.ts.

import "server-only";

import { aggregateAttemptsBySubject, fetchSubjectsOrdered } from "~backend/repositories/analytics.repository";
import { InternalServerError } from "~backend/errors";

export type SubjectReport = {
  name: string;
  score: number;
  attempted: number;
  correct: number;
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

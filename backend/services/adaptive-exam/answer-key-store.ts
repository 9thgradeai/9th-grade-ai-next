// backend/services/adaptive-exam/answer-key-store.ts
// In-memory AnswerKeyStore for Phase 12; Prisma adapter follows the same port.

import "server-only";

import type { AnswerKeyStore, SecureAnswerKey, EntityId, AdaptiveExecutionContext } from "./contracts";

export function createInMemoryAnswerKeyStore(): AnswerKeyStore & {
  putForAttempt(attemptId: EntityId, key: SecureAnswerKey): void;
} {
  const byPaper = new Map<EntityId, SecureAnswerKey>();
  const byAttempt = new Map<EntityId, SecureAnswerKey>();

  return {
    async put(paperId, key) {
      byPaper.set(paperId, key);
    },
    async getForScoring(paperId) {
      return byPaper.get(paperId) ?? null;
    },
    async releaseForReview(attemptId, _ctx) {
      return byAttempt.get(attemptId) ?? null;
    },
    putForAttempt(attemptId, key) {
      byAttempt.set(attemptId, key);
    },
  };
}

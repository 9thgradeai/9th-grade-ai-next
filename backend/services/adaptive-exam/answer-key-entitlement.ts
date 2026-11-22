// backend/services/adaptive-exam/answer-key-entitlement.ts
// Phase 12 of Adaptive Exam V2.0: PDF answer-key entitlement.
//
// Answer keys are NEVER exposed through the question paper. Release happens
// only post-submit to the owning candidate, or to an admin, and is audited.

import "server-only";

import type {
  AdaptiveExecutionContext,
  AnswerKeyStore,
  ExamAuditService,
  SecureAnswerKey,
} from "./contracts";
import { adaptiveError } from "./errors";

export type AnswerKeyEntitlementService = {
  release(attemptId: string, ctx: AdaptiveExecutionContext): Promise<SecureAnswerKey | null>;
};

export function createAnswerKeyEntitlementService(options: {
  store: AnswerKeyStore;
  audit?: ExamAuditService;
  clock: { now(): string };
  requestId: string;
  /** Returns true when the given userId is an admin. */
  isAdmin: (userId: string) => boolean | Promise<boolean>;
  /** Returns the owner userId of the attempt, or null if not found/submitted. */
  attemptOwner: (attemptId: string) => Promise<string | null>;
  /** Returns true when the attempt has been submitted. */
  isSubmitted: (attemptId: string) => Promise<boolean>;
}): AnswerKeyEntitlementService {
  const { store, audit, clock, requestId } = options;

  function fail(code: Parameters<typeof adaptiveError>[0], message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError(code, message, { stage: "audit", requestId, metadata });
  }

  return {
    async release(attemptId, ctx) {
      if (!ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "Authentication required to release an answer key.", { attemptId });
      }
      const submitted = await options.isSubmitted(attemptId);
      if (!submitted) {
        fail("ADAPTIVE_ANSWER_KEY_RELEASE_DENIED", "Answer key is not available before submission.", { attemptId });
      }
      const owner = await options.attemptOwner(attemptId);
      const admin = await options.isAdmin(ctx.userId);
      if (owner !== ctx.userId && !admin) {
        fail("ADAPTIVE_UNAUTHORIZED", "You are not entitled to this answer key.", { attemptId });
      }
      const key = await store.releaseForReview(attemptId, ctx);
      if (audit) {
        try {
          await audit.record({
            name: "ANSWER_KEY_RELEASED",
            occurredAt: clock.now(),
            requestId: ctx.requestId,
            actorId: ctx.userId,
            entityType: "SecureAnswerKey",
            entityId: attemptId,
            metadata: { admin, ownerMatch: owner === ctx.userId },
          });
        } catch {
          // Audit failure must not leak the key; swallow and continue.
        }
      }
      return key;
    },
  };
}

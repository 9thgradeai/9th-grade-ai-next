// backend/services/adaptive-exam/prisma-answer-key-store.ts
// Server-only answer key storage. Scoring resolves by paperId; post-submit
// review resolves attempt → paper → key and enforces ownership + completion.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdaptiveExecutionContext,
  AnswerKeyStore,
  EntityId,
  OptionKey,
  SecureAnswerKey,
  SecureAnswerKeyEntry,
} from "./contracts";
import { adaptiveError } from "./errors";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function keyFromRow(row: {
  paperId: string;
  contentHash: string;
  entries: unknown;
  createdAt: Date;
}): SecureAnswerKey {
  const entries = Array.isArray(row.entries)
    ? (row.entries as Array<{ position?: unknown; correctOption?: unknown; explanation?: unknown }>)
        .filter(
          (entry): entry is { position: number; correctOption: OptionKey; explanation: string } =>
            typeof entry?.position === "number" &&
            typeof entry?.correctOption === "string" &&
            ["A", "B", "C", "D"].includes(entry.correctOption) &&
            typeof entry?.explanation === "string",
        )
        .map((entry) => ({
          position: entry.position,
          correctOption: entry.correctOption,
          explanation: entry.explanation,
        }))
    : [];
  return {
    paperId: row.paperId,
    contentHash: row.contentHash,
    entries: entries as SecureAnswerKeyEntry[],
    createdAt: row.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export function createPrismaAnswerKeyStore(client: PrismaClient): AnswerKeyStore {
  return {
    async put(paperId, key) {
      try {
        await client.adaptiveAnswerKey.create({
          data: {
            paperId,
            contentHash: key.contentHash,
            entries: asJson(key.entries),
            createdAt: new Date(key.createdAt),
          },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        throw adaptiveError("ADAPTIVE_IDEMPOTENCY_CONFLICT", "Answer key already exists for this paper.", {
          stage: "paper",
          requestId: "prisma-answer-key-store",
          metadata: { paperId },
          cause: error,
        });
      }
    },
    async getForScoring(paperId: EntityId) {
      const row = await client.adaptiveAnswerKey.findUnique({ where: { paperId } });
      return row ? keyFromRow(row) : null;
    },
    async releaseForReview(attemptId: EntityId, ctx: AdaptiveExecutionContext) {
      const session = await client.adaptiveExamSession.findUnique({ where: { id: attemptId } });
      if (!session || session.userId !== ctx.userId || session.status !== "COMPLETED") {
        throw adaptiveError(
          "ADAPTIVE_ANSWER_KEY_RELEASE_DENIED",
          "Answer key is only available after a completed attempt owned by the viewer.",
          { stage: "reporting", requestId: ctx.requestId, metadata: { attemptId } },
        );
      }
      const row = await client.adaptiveAnswerKey.findUnique({ where: { paperId: session.paperId } });
      return row ? keyFromRow(row) : null;
    },
  };
}

/** Resolves the owner of an attempt for the entitlement service. */
export function createAttemptOwnerResolver(
  client: PrismaClient,
): (attemptId: EntityId) => Promise<string | null> {
  return async (attemptId) => {
    const row = await client.adaptiveExamSession.findUnique({
      where: { id: attemptId },
      select: { userId: true, status: true },
    });
    return row?.status === "COMPLETED" ? row.userId : null;
  };
}

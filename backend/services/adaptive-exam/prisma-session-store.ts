// backend/services/adaptive-exam/prisma-session-store.ts
// Durable ExamSessionStore with optimistic concurrency and idempotent paper
// snapshot writes. The app-layer lifecycle service remains the state authority.

import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  AdaptiveExamProfileId,
  ExamLifecycleStatus,
  ExamSession,
  OptionKey,
  PaperSnapshot,
  ValidationOutcome,
} from "./contracts";
import type { ExamSessionStore } from "./exam-session";
import { adaptiveError } from "./errors";

type SessionRow = Prisma.AdaptiveExamSessionGetPayload<Record<string, never>>;
type PaperRow = Prisma.AdaptivePaperSnapshotGetPayload<{
  include: { blueprint: { select: { contentHash: true } } };
}>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function optionKeys(value: unknown): Record<number, OptionKey> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<number, OptionKey> = {};
  for (const [key, answer] of Object.entries(value as Record<string, unknown>)) {
    const position = Number(key);
    if (
      Number.isInteger(position) &&
      typeof answer === "string" &&
      ["A", "B", "C", "D"].includes(answer)
    ) {
      out[position] = answer as OptionKey;
    }
  }
  return out;
}

function positions(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    .sort((a, b) => a - b);
}

function rowToSession(row: SessionRow): ExamSession {
  return {
    attemptId: row.id,
    userId: row.userId,
    paperId: row.paperId,
    blueprintId: row.blueprintId,
    profileId: row.profileId as AdaptiveExamProfileId,
    profileVersion: row.profileVersion,
    status: row.status as ExamLifecycleStatus,
    startsAt: row.startsAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    ...(row.submittedAt ? { submittedAt: row.submittedAt.toISOString() } : {}),
    answers: optionKeys(row.answers),
    flags: positions(row.flags),
    ...(row.lastSavedAt ? { lastSavedAt: row.lastSavedAt.toISOString() } : {}),
    version: row.version,
    idempotencyKey: row.idempotencyKey,
  };
}

function rowToPaper(row: PaperRow): PaperSnapshot {
  return {
    id: row.id,
    version: row.version,
    blueprintId: row.blueprintId,
    blueprintHash: row.blueprint.contentHash,
    createdAt: row.createdAt.toISOString(),
    questions: row.questions as unknown as PaperSnapshot["questions"],
    contentHash: row.contentHash,
    validation: row.validation as ValidationOutcome,
  };
}

function writeFields(session: ExamSession) {
  return {
    userId: session.userId,
    paperId: session.paperId,
    blueprintId: session.blueprintId,
    profileId: session.profileId,
    profileVersion: session.profileVersion,
    status: session.status,
    startsAt: new Date(session.startsAt),
    expiresAt: new Date(session.expiresAt),
    submittedAt: session.submittedAt ? new Date(session.submittedAt) : null,
    answers: asJson(session.answers),
    flags: asJson(session.flags),
    lastSavedAt: session.lastSavedAt ? new Date(session.lastSavedAt) : null,
    version: session.version,
    idempotencyKey: session.idempotencyKey,
  };
}

export function createPrismaExamSessionStore(client: PrismaClient): ExamSessionStore {
  return {
    async get(attemptId) {
      const row = await client.adaptiveExamSession.findUnique({ where: { id: attemptId } });
      return row ? rowToSession(row) : null;
    },
    async findByIdempotencyKey(userId, key) {
      const row = await client.adaptiveExamSession.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      return row ? rowToSession(row) : null;
    },
    async put(session) {
      const existing = await client.adaptiveExamSession.findUnique({
        where: { id: session.attemptId },
        select: { version: true },
      });
      const data = writeFields(session);
      if (!existing) {
        try {
          await client.adaptiveExamSession.create({
            data: { id: session.attemptId, ...data },
          });
        } catch (error) {
          const code = (error as { code?: string })?.code;
          if (code === "P2002") {
            throw adaptiveError("ADAPTIVE_IDEMPOTENCY_CONFLICT", "Session idempotency key already used.", {
              stage: "session",
              requestId: "prisma-session-store",
              metadata: { attemptId: session.attemptId },
              cause: error,
            });
          }
          throw error;
        }
        return session;
      }
      const result = await client.adaptiveExamSession.updateMany({
        where: { id: session.attemptId, version: { lt: session.version } },
        data,
      });
      if (result.count === 0) {
        throw adaptiveError("ADAPTIVE_SESSION_CONFLICT", "Stale session write rejected.", {
          stage: "session",
          requestId: "prisma-session-store",
          metadata: { attemptId: session.attemptId, version: session.version },
        });
      }
      return session;
    },
    async delete(attemptId) {
      await client.adaptiveExamSession.deleteMany({ where: { id: attemptId } });
    },
    async getPaperSnapshot(paperId) {
      const row = await client.adaptivePaperSnapshot.findUnique({
        where: { id: paperId },
        include: { blueprint: { select: { contentHash: true } } },
      });
      return row ? rowToPaper(row) : null;
    },
    async putPaperSnapshot(paper) {
      const existing = await client.adaptivePaperSnapshot.findUnique({
        where: { id: paper.id },
        select: { id: true },
      });
      if (existing) return paper;
      await client.adaptivePaperSnapshot.create({
        data: {
          id: paper.id || randomUUID(),
          blueprintId: paper.blueprintId,
          version: paper.version,
          questions: asJson(paper.questions),
          contentHash: paper.contentHash,
          validation: paper.validation,
          createdAt: new Date(paper.createdAt),
        },
      });
      return paper;
    },
  };
}

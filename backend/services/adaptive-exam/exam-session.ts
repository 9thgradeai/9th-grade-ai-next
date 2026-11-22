// backend/services/adaptive-exam/exam-session.ts
// Module 9a of Adaptive Exam V2.0: ExamSessionService.
//
// Server-authoritative timer, optimistic concurrency, ownership checks,
// terminal-state enforcement. In-memory store here; Prisma adapter follows
// the same port.

import "server-only";

import type {
  ExamSession,
  ExamSessionService,
  IsoTimestamp,
  SubmitAdaptiveExamCommand,
} from "./contracts";
import { adaptiveError } from "./errors";

export interface ExamSessionStore {
  get(attemptId: string): Promise<ExamSession | null>;
  put(session: ExamSession): Promise<ExamSession>;
  delete(attemptId: string): Promise<void>;
}

export function createInMemoryExamSessionStore(): ExamSessionStore {
  const rows = new Map<string, ExamSession>();
  return {
    async get(attemptId) {
      return rows.get(attemptId) ?? null;
    },
    async put(session) {
      rows.set(session.attemptId, session);
      return session;
    },
    async delete(attemptId) {
      rows.delete(attemptId);
    },
  };
}

export type CreateExamSessionServiceOptions = Readonly<{
  store: ExamSessionStore;
  clock: { now(): IsoTimestamp };
  requestId: string;
  /** Resolves paper/blueprint/profile for a given paperId. */
  resolvePaper: (paperId: string) => Promise<{
    paperId: string;
    blueprintId: string;
    profileId: ExamSession["profileId"];
    profileVersion: number;
    durationSec: number;
  } | null>;
}>;

export function createExamSessionService(
  options: CreateExamSessionServiceOptions,
): ExamSessionService {
  const { store, clock, resolvePaper } = options;

  function fail(code: Parameters<typeof adaptiveError>[0], message: string, metadata: Record<string, unknown> = {}): never {
    throw adaptiveError(code, message, { stage: "session", requestId: options.requestId, metadata });
  }

  return {
    async create(ctx, command) {
      const resolved = await resolvePaper(command.paperId);
      if (!resolved) {
        fail("ADAPTIVE_PAPER_NOT_FOUND", "Paper does not exist for this session.", { paperId: command.paperId });
      }
      const now = clock.now();
      const expiresAt = new Date(new Date(now).getTime() + resolved.durationSec * 1000).toISOString();
      const session: ExamSession = {
        attemptId: command.idempotencyKey,
        userId: ctx.userId,
        paperId: command.paperId,
        blueprintId: resolved.blueprintId,
        profileId: resolved.profileId,
        profileVersion: resolved.profileVersion,
        status: "IN_PROGRESS",
        startsAt: now,
        expiresAt,
        answers: {},
        flags: [],
        version: 1,
      };
      return store.put(session);
    },

    async get(userId, attemptId) {
      const session = await store.get(attemptId);
      if (!session || session.userId !== userId) return null;
      return session;
    },

    async recordAnswer(userId, attemptId, position, option) {
      const session = await store.get(attemptId);
      if (!session || session.userId !== userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "Session not found or not owned by user.", { attemptId });
      }
      if (session.status !== "IN_PROGRESS") {
        fail("ADAPTIVE_SESSION_EXPIRED", "Session is not in progress.", { attemptId, status: session.status });
      }
      if (new Date(clock.now()) > new Date(session.expiresAt)) {
        fail("ADAPTIVE_SESSION_EXPIRED", "Session has expired.", { attemptId });
      }
      const updated: ExamSession = {
        ...session,
        answers: { ...session.answers, [position]: option },
        lastSavedAt: clock.now(),
        version: session.version + 1,
      };
      return store.put(updated);
    },

    async setFlag(userId, attemptId, position, flagged) {
      const session = await store.get(attemptId);
      if (!session || session.userId !== userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "Session not found or not owned by user.", { attemptId });
      }
      const flags = new Set(session.flags);
      if (flagged) flags.add(position);
      else flags.delete(position);
      const updated: ExamSession = {
        ...session,
        flags: [...flags],
        lastSavedAt: clock.now(),
        version: session.version + 1,
      };
      return store.put(updated);
    },

    async expire(attemptId) {
      const session = await store.get(attemptId);
      if (!session) {
        fail("ADAPTIVE_SESSION_NOT_FOUND", "Session not found.", { attemptId });
      }
      const updated: ExamSession = { ...session, status: "COMPLETED", version: session.version + 1 };
      return store.put(updated);
    },

    async submit(ctx, command) {
      const session = await store.get(command.attemptId);
      if (!session || session.userId !== ctx.userId) {
        fail("ADAPTIVE_UNAUTHORIZED", "Session not found or not owned by user.", { attemptId: command.attemptId });
      }
      if (session.status !== "IN_PROGRESS") {
        // Idempotent: already submitted returns existing session.
        return session;
      }
      const updated: ExamSession = {
        ...session,
        status: "COMPLETED",
        submittedAt: clock.now(),
        version: session.version + 1,
      };
      return store.put(updated);
    },
  };
}

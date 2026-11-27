// backend/services/adaptive-exam/exam-session.ts
// Module 9a of Adaptive Exam V2.0: ExamSessionService.
//
// Server-authoritative timer, optimistic concurrency, ownership checks and
// terminal-state enforcement. The in-memory store mirrors the Prisma adapter's
// port so tests and production share identical lifecycle semantics.

import "server-only";

import type {
  ExamSession,
  ExamSessionService,
  IsoTimestamp,
  PaperSnapshot,
  SubmitAdaptiveExamCommand,
} from "./contracts";
import { adaptiveError } from "./errors";

export interface ExamSessionStore {
  get(attemptId: string): Promise<ExamSession | null>;
  findByIdempotencyKey(userId: string, key: string): Promise<ExamSession | null>;
  put(session: ExamSession): Promise<ExamSession>;
  delete(attemptId: string): Promise<void>;
  /** Retrieves the paper snapshot associated with a session's paperId. */
  getPaperSnapshot(paperId: string): Promise<PaperSnapshot | null>;
  putPaperSnapshot(paper: PaperSnapshot): Promise<PaperSnapshot>;
}

export function createInMemoryExamSessionStore(): ExamSessionStore {
  const rows = new Map<string, ExamSession>();
  const paperSnapshots = new Map<string, PaperSnapshot>();
  return {
    async get(attemptId) {
      return rows.get(attemptId) ?? null;
    },
    async findByIdempotencyKey(userId, key) {
      const row = rows.get(key);
      return row && row.userId === userId ? row : null;
    },
    async put(session) {
      rows.set(session.attemptId, session);
      return session;
    },
    async delete(attemptId) {
      rows.delete(attemptId);
    },
    async getPaperSnapshot(paperId) {
      return paperSnapshots.get(paperId) ?? null;
    },
    async putPaperSnapshot(paper) {
      paperSnapshots.set(paper.id, paper);
      return paper;
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

  function expired(session: ExamSession): boolean {
    return new Date(clock.now()).getTime() >= new Date(session.expiresAt).getTime();
  }

  async function owned(userId: string, attemptId: string): Promise<ExamSession> {
    const session = await store.get(attemptId);
    if (!session || session.userId !== userId) {
      fail("ADAPTIVE_OWNERSHIP_DENIED", "Session not found or not owned by user.", { attemptId });
    }
    return session;
  }

  async function editable(userId: string, attemptId: string): Promise<ExamSession> {
    const session = await owned(userId, attemptId);
    if (session.status !== "IN_PROGRESS") {
      fail("ADAPTIVE_SESSION_INVALID_STATE", "Session is not in progress.", {
        attemptId,
        status: session.status,
      });
    }
    if (expired(session)) {
      await store.put({ ...session, status: "EXPIRED", version: session.version + 1 });
      fail("ADAPTIVE_SESSION_EXPIRED", "Session has expired.", { attemptId });
    }
    return session;
  }

  return {
    async create(ctx, command) {
      const existing = await store.findByIdempotencyKey(ctx.userId, command.idempotencyKey);
      if (existing) return existing;

      const resolved = await resolvePaper(command.paperId);
      if (!resolved) {
        fail("ADAPTIVE_PAPER_NOT_FOUND", "Paper does not exist for this session.", {
          paperId: command.paperId,
        });
      }
      const now = clock.now();
      const expiresAt = new Date(
        new Date(now).getTime() + Math.max(0, resolved.durationSec) * 1000,
      ).toISOString();
      return store.put({
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
        idempotencyKey: command.idempotencyKey,
      });
    },

    async get(userId, attemptId) {
      const session = await store.get(attemptId);
      if (!session || session.userId !== userId) return null;
      return session;
    },

    async recordAnswer(userId, attemptId, position, option, expectedVersion) {
      const session = await editable(userId, attemptId);
      if (expectedVersion !== undefined && expectedVersion !== session.version) {
        fail("ADAPTIVE_SESSION_CONFLICT", "Stale answer write rejected.", {
          attemptId,
          expectedVersion,
          actualVersion: session.version,
        });
      }
      return store.put({
        ...session,
        answers: { ...session.answers, [position]: option },
        lastSavedAt: clock.now(),
        version: session.version + 1,
      });
    },

    async setFlag(userId, attemptId, position, flagged, expectedVersion) {
      const session = await editable(userId, attemptId);
      if (expectedVersion !== undefined && expectedVersion !== session.version) {
        fail("ADAPTIVE_SESSION_CONFLICT", "Stale flag write rejected.", {
          attemptId,
          expectedVersion,
          actualVersion: session.version,
        });
      }
      const flags = new Set(session.flags);
      if (flagged) flags.add(position);
      else flags.delete(position);
      return store.put({
        ...session,
        flags: [...flags].sort((a, b) => a - b),
        lastSavedAt: clock.now(),
        version: session.version + 1,
      });
    },

    async expire(attemptId) {
      const session = await store.get(attemptId);
      if (!session) fail("ADAPTIVE_SESSION_NOT_FOUND", "Session not found.", { attemptId });
      if (session.status === "COMPLETED") return session;
      return store.put({ ...session, status: "EXPIRED", version: session.version + 1 });
    },

    async submit(ctx, command: SubmitAdaptiveExamCommand) {
      const session = await owned(ctx.userId, command.attemptId);
      if (session.paperId !== command.paperId) {
        fail("ADAPTIVE_SUBMISSION_INVALID", "Submission paper does not match the session.", {
          attemptId: command.attemptId,
        });
      }
      if (session.status === "COMPLETED") return session;
      if (session.status === "EXPIRED" || expired(session)) {
        await store.put({ ...session, status: "EXPIRED", version: session.version + 1 });
        fail("ADAPTIVE_SESSION_EXPIRED", "Expired sessions cannot be submitted.", {
          attemptId: command.attemptId,
        });
      }
      if (session.status === "SUBMITTING") {
        fail("ADAPTIVE_SESSION_CONFLICT", "Submission is already in progress.", {
          attemptId: command.attemptId,
        });
      }
      if (session.status !== "IN_PROGRESS") {
        fail("ADAPTIVE_SESSION_INVALID_STATE", "Session cannot be submitted.", {
          attemptId: command.attemptId,
          status: session.status,
        });
      }
      const submitting = await store.put({
        ...session,
        status: "SUBMITTING",
        version: session.version + 1,
      });
      return store.put({
        ...submitting,
        status: "COMPLETED",
        submittedAt: clock.now(),
        version: submitting.version + 1,
      });
    },
  };
}

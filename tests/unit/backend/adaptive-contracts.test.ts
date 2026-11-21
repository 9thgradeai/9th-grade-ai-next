import { describe, it, expect } from "vitest";

import { AppError } from "~backend/errors";
import {
  ADAPTIVE_ERROR_HTTP_STATUS,
  AdaptiveExamError,
  adaptiveError,
  clientFacingMessage,
  isAdaptiveExamError,
  sanitizeAdaptiveMetadata,
} from "~backend/services/adaptive-exam/errors";
import type {
  AdaptiveExamErrorCode,
  CandidatePaperQuestion,
  PaperSnapshot,
  QuestionOptions,
  StartAdaptiveExamCommand,
  SubmitAdaptiveExamCommand,
} from "~backend/services/adaptive-exam/contracts";

describe("adaptive error taxonomy", () => {
  it("maps every code to a valid HTTP status and a candidate-safe message", () => {
    const codes = Object.keys(ADAPTIVE_ERROR_HTTP_STATUS) as AdaptiveExamErrorCode[];
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) {
      const status = ADAPTIVE_ERROR_HTTP_STATUS[code];
      expect(Number.isInteger(status)).toBe(true);
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThanOrEqual(504);
      expect(clientFacingMessage(code).length).toBeGreaterThan(0);
    }
  });

  it("uses the statuses required by ownership, lifecycle and answer-key rules", () => {
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_UNAUTHORIZED).toBe(401);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_OWNERSHIP_DENIED).toBe(403);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_ANSWER_KEY_RELEASE_DENIED).toBe(403);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_PROFILE_NOT_APPROVED).toBe(403);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_PROFILE_NOT_FOUND).toBe(404);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_INSUFFICIENT_DATA).toBe(422);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_SESSION_EXPIRED).toBe(410);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_IDEMPOTENCY_CONFLICT).toBe(409);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_RATE_LIMITED).toBe(429);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_GENERATION_TIMEOUT).toBe(504);
    expect(ADAPTIVE_ERROR_HTTP_STATUS.ADAPTIVE_ANSWER_KEY_MISSING).toBe(500);
  });

  it("creates an AppError-compatible error with operational 4xx and quiet 5xx", () => {
    const cause = new Error("upstream detail");
    const error = adaptiveError("ADAPTIVE_SESSION_EXPIRED", "The exam time has ended.", {
      stage: "session",
      requestId: "req-1",
      correlationId: "corr-1",
      cause,
      metadata: { attemptId: "attempt-1" },
    });

    expect(error).toBeInstanceOf(AdaptiveExamError);
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(410);
    expect(error.code).toBe("ADAPTIVE_SESSION_EXPIRED");
    expect(error.adaptiveCode).toBe("ADAPTIVE_SESSION_EXPIRED");
    expect(error.isOperational).toBe(true);
    expect(error.stage).toBe("session");
    expect(error.requestId).toBe("req-1");
    expect(error.correlationId).toBe("corr-1");
    expect(error.cause).toBe(cause);
    expect(error.metadata).toEqual({ attemptId: "attempt-1" });
    expect(isAdaptiveExamError(error)).toBe(true);

    const internal = adaptiveError("ADAPTIVE_ANSWER_KEY_MISSING", "Key missing", {
      stage: "scoring",
      requestId: "req-2",
    });
    expect(internal.isOperational).toBe(false);
    expect(internal.statusCode).toBe(500);
    expect(isAdaptiveExamError(new AppError(500, "x", "X"))).toBe(false);
  });
});

describe("adaptive error metadata redaction", () => {
  it("redacts answer-bearing keys at any depth, including arrays", () => {
    const sanitized = sanitizeAdaptiveMetadata({
      attemptId: "attempt-1",
      correctOption: "A",
      explanation: "because A",
      answers: [{ position: 1, option: "B" }],
      nested: { verifiedAnswer: "C", safeField: "kept" },
    });

    expect(sanitized).toEqual({
      attemptId: "attempt-1",
      correctOption: "[REDACTED]",
      explanation: "[REDACTED]",
      answers: "[REDACTED]",
      nested: { verifiedAnswer: "[REDACTED]", safeField: "kept" },
    });
    expect(JSON.stringify(sanitized)).not.toContain("because A");
    expect(JSON.stringify(sanitized)).not.toContain('"option"');
  });

  it("applies redaction to metadata attached to a thrown error", () => {
    const error = adaptiveError("ADAPTIVE_QUESTION_INVALID", "Invalid question", {
      stage: "validation",
      requestId: "req-3",
      metadata: { position: 4, correctOption: "D" },
    });
    expect(error.metadata).toEqual({ position: 4, correctOption: "[REDACTED]" });
  });
});

/**
 * Compile-time contract checks. `typecheck:tests` fails if any of these
 * `@ts-expect-error` directives stops being an error — i.e. if a future edit
 * reintroduces an answer or client-trusted rule into a candidate-facing type.
 */
describe("no-leak contracts", () => {
  const question: CandidatePaperQuestion = {
    position: 1,
    sourceType: "PYQ",
    subjectId: "subject-1",
    subjectName: "English",
    topicPath: "English/Grammar",
    language: "en",
    difficulty: "MEDIUM",
    questionText: "Choose the correct word.",
    options: { A: "a", B: "b", C: "c", D: "d" },
    provenance: { sourceType: "PYQ", sourceFile: "sample.pdf" },
    marks: 1,
  };

  const paper: PaperSnapshot = {
    id: "paper-1",
    version: 1,
    blueprintId: "blueprint-1",
    blueprintHash: "hash-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    questions: [question],
    contentHash: "content-hash-1",
    validation: "PASS",
  };

  const submission: SubmitAdaptiveExamCommand = {
    userId: "user-1",
    attemptId: "attempt-1",
    paperId: "paper-1",
    answers: [{ position: 1, option: "A" }],
    durationSec: 3600,
    idempotencyKey: "key-1",
  };

  const start: StartAdaptiveExamCommand = {
    userId: "user-1",
    paperId: "paper-1",
    blueprintId: "blueprint-1",
    idempotencyKey: "key-1",
  };

  it("exposes only candidate-safe fields on the wire types", () => {
    expect(Object.keys(question)).toContain("questionText");
    expect(Object.keys(question)).not.toContain("correctOption");
    expect(Object.keys(question)).not.toContain("explanation");
    expect(Object.keys(paper)).not.toContain("answerKey");
    expect(Object.keys(submission)).not.toContain("correctAnswers");
    expect(Object.keys(submission)).not.toContain("questionIds");
    expect(Object.keys(start)).not.toContain("durationSec");
  });

  it("rejects any attempt to smuggle answers or client-trusted rules", () => {
    const rejectedQuestion: CandidatePaperQuestion = {
      ...question,
      // @ts-expect-error candidate questions cannot carry a correct answer
      correctOption: "A",
    };
    const rejectedPaper: PaperSnapshot = {
      ...paper,
      // @ts-expect-error the answer key is stored separately, never on the paper
      answerKey: { entries: [] },
    };
    const rejectedSubmission: SubmitAdaptiveExamCommand = {
      ...submission,
      // @ts-expect-error correct answers are never supplied by the client
      correctAnswers: { 1: "A" },
    };
    const rejectedStart: StartAdaptiveExamCommand = {
      ...start,
      // @ts-expect-error duration is resolved from the committed blueprint
      durationSec: 3600,
    };
    // @ts-expect-error exactly four options are required; three cannot be typed
    const incompleteOptions: QuestionOptions = { A: "a", B: "b", C: "c" };

    expect(rejectedQuestion.position).toBe(1);
    expect(rejectedPaper.id).toBe("paper-1");
    expect(rejectedSubmission.attemptId).toBe("attempt-1");
    expect(rejectedStart.paperId).toBe("paper-1");
    expect(Object.keys(incompleteOptions)).toHaveLength(3);
  });
});

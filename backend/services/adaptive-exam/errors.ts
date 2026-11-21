// backend/services/adaptive-exam/errors.ts
// Structured error taxonomy for Adaptive Exam V2.0. Extends the canonical
// AppError so existing `toHttpResponse()` routes need no special casing.
// Every error carries a stable code, a pipeline stage and a requestId.
//
// Security invariant: an adaptive error must never become an answer-leak
// channel. `metadata` is redacted at construction time — correct options,
// explanations and answer maps can never be logged or returned through it.

import "server-only";

import { AppError } from "~backend/errors";
import type {
  AdaptiveExamErrorCode,
  AdaptiveExamStage,
} from "./contracts";

/**
 * Single source of truth for adaptive error → HTTP status mapping.
 * Typed as a complete Record so adding a code to the union without a status
 * is a compile-time error.
 */
export const ADAPTIVE_ERROR_HTTP_STATUS: Record<AdaptiveExamErrorCode, number> = {
  // 4xx — operational, safe to show to the candidate.
  ADAPTIVE_UNAUTHORIZED: 401,
  ADAPTIVE_FORBIDDEN: 403,
  ADAPTIVE_OWNERSHIP_DENIED: 403,
  ADAPTIVE_ANSWER_KEY_RELEASE_DENIED: 403,
  ADAPTIVE_PROFILE_NOT_APPROVED: 403,
  ADAPTIVE_PROFILE_NOT_FOUND: 404,
  ADAPTIVE_PAPER_NOT_FOUND: 404,
  ADAPTIVE_BLUEPRINT_NOT_FOUND: 404,
  ADAPTIVE_SESSION_NOT_FOUND: 404,
  ADAPTIVE_SUBMISSION_NOT_FOUND: 404,
  ADAPTIVE_SESSION_EXPIRED: 410,
  ADAPTIVE_PROFILE_INVALID: 400,
  ADAPTIVE_OVERRIDE_NOT_ALLOWED: 400,
  ADAPTIVE_SUBMISSION_INVALID: 400,
  ADAPTIVE_HISTORICAL_SCOPE_INVALID: 400,
  ADAPTIVE_IMPORT_INVALID: 400,
  ADAPTIVE_INSUFFICIENT_DATA: 422,
  ADAPTIVE_QUESTION_INVALID: 422,
  ADAPTIVE_PAPER_INVALID: 422,
  ADAPTIVE_BLUEPRINT_INVALID: 422,
  ADAPTIVE_SESSION_INVALID_STATE: 409,
  ADAPTIVE_SESSION_CONFLICT: 409,
  ADAPTIVE_IDEMPOTENCY_CONFLICT: 409,
  ADAPTIVE_IMPORT_CONFLICT: 409,
  ADAPTIVE_RATE_LIMITED: 429,

  // 5xx — non-operational; `toHttpResponse` logs the cause server-side and
  // returns a generic message so Prisma/LLM internals never reach the client.
  ADAPTIVE_GENERATION_FAILED: 502,
  ADAPTIVE_GENERATION_TIMEOUT: 504,
  ADAPTIVE_DEPENDENCY_UNAVAILABLE: 503,
  ADAPTIVE_ANSWER_KEY_MISSING: 500,
  ADAPTIVE_ANSWER_KEY_CORRUPT: 500,
  ADAPTIVE_PERSISTENCE_ERROR: 500,
  ADAPTIVE_AUDIT_ERROR: 500,
  ADAPTIVE_INTERNAL_ERROR: 500,
};

/** Field names that must never appear in adaptive log/error metadata. */
const SENSITIVE_METADATA_KEY =
  /^(answers?|answerkey|correct(option|answer)?|selected|selection|claimedanswer|verifiedanswer|explanation|explanationorigin)$/i;

const MAX_REDACTION_DEPTH = 3;

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_REDACTION_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = SENSITIVE_METADATA_KEY.test(key)
        ? "[REDACTED]"
        : redactValue(nested, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * Bounded, recursive redaction for structured fields attached to an error.
 * Sensitive keys are replaced (not dropped) so an audit reader can still see
 * that a protected field was present without learning its value.
 */
export function sanitizeAdaptiveMetadata(
  metadata: Record<string, unknown> = {},
): Record<string, unknown> {
  return redactValue(metadata, 0) as Record<string, unknown>;
}

export type AdaptiveExamErrorOptions = {
  stage: AdaptiveExamStage;
  requestId: string;
  correlationId?: string;
  cause?: unknown;
  metadata?: Record<string, unknown>;
};

export class AdaptiveExamError extends AppError {
  public readonly adaptiveCode: AdaptiveExamErrorCode;
  public readonly stage: AdaptiveExamStage;
  public readonly requestId: string;
  public readonly correlationId?: string;
  public readonly metadata: Record<string, unknown>;

  constructor(
    code: AdaptiveExamErrorCode,
    message: string,
    options: AdaptiveExamErrorOptions,
  ) {
    const statusCode = ADAPTIVE_ERROR_HTTP_STATUS[code];
    // Mirrors AppError semantics: 4xx are expected/operational, 5xx are not.
    super(
      statusCode,
      message,
      code,
      statusCode < 500,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.adaptiveCode = code;
    this.stage = options.stage;
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.metadata = sanitizeAdaptiveMetadata(options.metadata);
  }
}

export function adaptiveError(
  code: AdaptiveExamErrorCode,
  message: string,
  options: AdaptiveExamErrorOptions,
): AdaptiveExamError {
  return new AdaptiveExamError(code, message, options);
}

export function isAdaptiveExamError(error: unknown): error is AdaptiveExamError {
  return error instanceof AdaptiveExamError;
}

/**
 * Short, stable candidate-facing messages. No score, answer or timing detail
 * is included here — those are only available through the authorized report.
 */
export function clientFacingMessage(code: AdaptiveExamErrorCode): string {
  switch (code) {
    case "ADAPTIVE_UNAUTHORIZED":
      return "Log in to continue.";
    case "ADAPTIVE_FORBIDDEN":
    case "ADAPTIVE_OWNERSHIP_DENIED":
    case "ADAPTIVE_ANSWER_KEY_RELEASE_DENIED":
    case "ADAPTIVE_PROFILE_NOT_APPROVED":
      return "You do not have access to this exam.";
    case "ADAPTIVE_PROFILE_NOT_FOUND":
    case "ADAPTIVE_PAPER_NOT_FOUND":
    case "ADAPTIVE_BLUEPRINT_NOT_FOUND":
    case "ADAPTIVE_SESSION_NOT_FOUND":
    case "ADAPTIVE_SUBMISSION_NOT_FOUND":
      return "The requested exam resource was not found.";
    case "ADAPTIVE_SESSION_EXPIRED":
      return "The exam time has ended.";
    case "ADAPTIVE_PROFILE_INVALID":
    case "ADAPTIVE_OVERRIDE_NOT_ALLOWED":
    case "ADAPTIVE_SUBMISSION_INVALID":
    case "ADAPTIVE_HISTORICAL_SCOPE_INVALID":
    case "ADAPTIVE_IMPORT_INVALID":
      return "The request is not valid for this exam.";
    case "ADAPTIVE_INSUFFICIENT_DATA":
      return "There is not enough verified data to prepare this exam.";
    case "ADAPTIVE_QUESTION_INVALID":
    case "ADAPTIVE_PAPER_INVALID":
    case "ADAPTIVE_BLUEPRINT_INVALID":
      return "This exam could not be prepared with reliable questions.";
    case "ADAPTIVE_SESSION_INVALID_STATE":
    case "ADAPTIVE_SESSION_CONFLICT":
    case "ADAPTIVE_IDEMPOTENCY_CONFLICT":
    case "ADAPTIVE_IMPORT_CONFLICT":
      return "The request conflicts with the current exam state.";
    case "ADAPTIVE_RATE_LIMITED":
      return "Please wait before trying again.";
    case "ADAPTIVE_GENERATION_FAILED":
    case "ADAPTIVE_GENERATION_TIMEOUT":
    case "ADAPTIVE_DEPENDENCY_UNAVAILABLE":
      return "Question preparation is temporarily unavailable. Please try again.";
    case "ADAPTIVE_ANSWER_KEY_MISSING":
    case "ADAPTIVE_ANSWER_KEY_CORRUPT":
    case "ADAPTIVE_PERSISTENCE_ERROR":
    case "ADAPTIVE_AUDIT_ERROR":
    case "ADAPTIVE_INTERNAL_ERROR":
      return "Something went wrong. Please try again.";
  }
}

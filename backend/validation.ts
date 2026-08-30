// backend/validation.ts — THE single source of truth for input validation.
//
 // Contract:
 //   • Every failure throws ValidationError → HTTP 400 { error, code: "VALIDATION_ERROR" }.
 //     (Plain Error throws here used to leak as 500s — fixed in Phase 7.)
 //   • Write endpoints run bodies through assertNoUnknownFields() so malformed
 //     input is REJECTED, never silently stripped.
 //   • Numeric inputs go through bounded-int helpers; enum-ish strings through
 //     validateEnumValue. Nothing is coerced implicitly.
 //
 // AI request payloads have their own validators in backend/ai/schemas.ts,
 // which follow this same contract and share the same error type.

import { ValidationError } from "~backend/errors";
import zxcvbn from "zxcvbn";

export interface LoginInput {
  email: string;
  password: string;
}

/** Password strength result for client feedback. */
export type PasswordStrength = {
  score: number; // 0-4
  feedback: string[];
  warning?: string;
};

/**
 * Evaluate password strength using zxcvbn.
 * Returns score (0-4) and actionable feedback.
 */
export function checkPasswordStrength(password: string): PasswordStrength {
  const result = zxcvbn(password);
  return {
    score: result.score,
    feedback: result.feedback.suggestions,
    warning: result.feedback.warning,
  };
}

/**
 * Check if password has been exposed in data breaches via Have I Been Pwned API.
 * Uses k-anonymity: sends first 5 chars of SHA-1 hash.
 * Returns true if password is pwned.
 */
export async function checkPasswordPwned(password: string): Promise<boolean> {
  const crypto = await import("crypto");
  const sha1 = crypto.createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "User-Agent": "9th-grade-ai" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false; // Fail open on API error

    const text = await res.text();
    for (const line of text.split("\n")) {
      const [hashSuffix, count] = line.split(":");
      if (hashSuffix === suffix && Number(count) > 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false; // Fail open on network error
  }
}

/**
 * Validate password meets minimum strength requirements.
 * Throws ValidationError if password is too weak or pwned.
 */
export async function validatePasswordStrength(password: string, fieldName = "Password"): Promise<void> {
  const { score, feedback, warning } = checkPasswordStrength(password);

  // Minimum score of 2 (fair) — allows reasonable passwords, blocks obvious weak ones
  if (score < 2) {
    const msg = warning ?? feedback[0] ?? "Password is too weak. Use a longer, more complex password.";
    throw new ValidationError(`${fieldName}: ${msg}`);
  }

  // Check HIBP (async, fail open)
  const pwned = await checkPasswordPwned(password);
  if (pwned) {
    throw new ValidationError(
      `${fieldName}: This password has appeared in a data breach. Please choose a different one.`,
    );
  }
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name?: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface QuestionSearchFilters {
  subject?: string;
  topic?: string;
  difficulty?: string;
  q?: string;
  paths?: string[];
  limit?: number;
  page?: number;
  id?: number;
  /** Restrict to a specific set of question ids (used by bookmark/notebook views). */
  ids?: number[];
  /** Filter by previous-year question year (Question.year). */
  year?: number;
  /** Filter by previous-year source exam (exact, case-insensitive). */
  sourceExam?: string;
  /** Filter by BCS exam term (e.g., "50th", "49th"). */
  bcsTerm?: string;
  /** Restrict to a specific ExamPaper id (exam-library paper browse). */
  paperId?: number;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reject bodies carrying fields outside the declared schema (strict mode). */
export function assertNoUnknownFields(
  body: unknown,
  allowed: readonly string[],
): void {
  if (!isRecord(body)) return; // shape errors are reported by field validators
  const known = new Set(allowed);
  const unexpected = Object.keys(body).filter((k) => !known.has(k));
  if (unexpected.length > 0) {
    throw new ValidationError(`Unexpected field(s): ${unexpected.join(", ")}.`);
  }
}

/**
 * Upper bound for one submission payload. Mirrors exam/build's questionCount
 * cap (200) — anything larger is a abuse vector (giant IN-clause queries), not
 * a real attempt.
 */
export const MAX_SUBMITTED_ANSWERS = 200;

/**
 * Shape-and-size check for graded-submission payloads
 * (`{ questionId, selected }[]`) shared by practice/daily-quiz/exam submit.
 */
export function validateSubmittedAnswers(
  value: unknown,
): asserts value is Array<{ questionId: number; selected: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("answers must be a non-empty array.");
  }
  if (value.length > MAX_SUBMITTED_ANSWERS) {
    throw new ValidationError(
      `answers must contain at most ${MAX_SUBMITTED_ANSWERS} entries.`,
    );
  }
}

/** Positive integer with an upper bound; defaults when absent. */
export function validateBoundedInt(
  value: unknown,
  fieldName: string,
  opts: { min?: number; max?: number; default?: number } = {},
): number | undefined {
  const { min = 1, max = Number.MAX_SAFE_INTEGER, default: fallback } = opts;
  if (value === undefined || value === null) {
    if (fallback !== undefined) return Math.min(Math.max(fallback, min), max);
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ValidationError(`${fieldName} must be an integer.`);
  }
  if (value < min) {
    throw new ValidationError(`${fieldName} must be >= ${min}.`);
  }
  if (value > max) {
    throw new ValidationError(`${fieldName} must be <= ${max}.`);
  }
  return value;
}

/** Membership check against a closed set of primitives. */
export function validateEnumValue<T extends string | number>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string,
): T | undefined {
  if (value === undefined || value === null) return undefined;
  const hit = allowed.find((a) => a === value);
  if (hit === undefined) {
    throw new ValidationError(`${fieldName} must be one of: ${allowed.join(", ")}.`);
  }
  return hit;
}

export function requirePositiveInteger(value: unknown, fieldName: string): number {
  const out = validateBoundedInt(value, fieldName, { min: 1 });
  if (out === undefined) {
    throw new ValidationError(`${fieldName} is required.`);
  }
  return out;
}

/**
 * Legacy alias kept for existing imports — same behavior as its sibling above.
 */
export function validatePositiveInteger(value: unknown, fieldName: string): number {
  return requirePositiveInteger(value, fieldName);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Upper bound on password length: bcrypt ignores bytes past 72, and unbounded
// inputs let a client force expensive hashing on every attempt (CPU DoS).
const MAX_PASSWORD_LENGTH = 128;

function assertPasswordLength(password: unknown, fieldName = "Password"): void {
  if (isString(password) && password.length > MAX_PASSWORD_LENGTH) {
    throw new ValidationError(`${fieldName} must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  }
}

export function validateLoginInput(body: unknown): LoginInput {
  assertNoUnknownFields(body, ["email", "password", "remember"]);
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  // Normalize before validating — trimmed/lowercased email is the canonical form.
  const rawEmail = body.email;
  const email = isString(rawEmail) ? rawEmail.trim().toLowerCase() : rawEmail;
  const password = body.password;

  if (!isString(email) || !EMAIL_RE.test(email)) {
    throw new ValidationError("Valid email is required.");
  }
  if (!isString(password) || password.length < 1) {
    throw new ValidationError("Password is required.");
  }
  assertPasswordLength(password);

  return { email, password };
}

export async function validateRegisterInput(body: unknown): Promise<RegisterInput> {
  assertNoUnknownFields(body, ["name", "email", "password"]);
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  const name = body.name;
  // Normalize before validating — trimmed/lowercased email is canonical.
  const rawEmail = body.email;
  const email = isString(rawEmail) ? rawEmail.trim().toLowerCase() : rawEmail;
  const password = body.password;

  if (!isString(name) || name.trim().length < 2) {
    throw new ValidationError("Name must be at least 2 characters.");
  }
  if (!isString(email) || !EMAIL_RE.test(email)) {
    throw new ValidationError("Valid email is required.");
  }
  // Aligned with the live registration contract (>=8). The historical >=6 here
  // was dead-code drift that Phase 7 eliminated.
  if (!isString(password) || password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters.");
  }
  assertPasswordLength(password);

  // Password strength check (zxcvbn + HIBP)
  await validatePasswordStrength(password);

  return { name: name.trim(), email: email as string, password };
}

export function validateUpdateProfileInput(body: unknown): UpdateProfileInput {
  assertNoUnknownFields(body, ["name"]);
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  const name = body.name;

  if (name === undefined) {
    return {};
  }
  if (!isString(name) || name.trim().length < 2) {
    throw new ValidationError("Name must be at least 2 characters.");
  }

  return { name: name.trim() };
}

export async function validateChangePasswordInput(body: unknown): Promise<ChangePasswordInput> {
  assertNoUnknownFields(body, ["currentPassword", "newPassword", "confirmPassword"]);
  if (!isRecord(body)) {
    throw new ValidationError("Request body must be an object.");
  }

  const currentPassword = body.currentPassword;
  const newPassword = body.newPassword;
  const confirmPassword = body.confirmPassword;

  if (!isString(currentPassword) || currentPassword.length < 1) {
    throw new ValidationError("Current password is required.");
  }
  if (!isString(newPassword) || newPassword.length < 8) {
    throw new ValidationError("New password must be at least 8 characters.");
  }
  assertPasswordLength(newPassword, "New password");

  // Password strength check (zxcvbn + HIBP)
  await validatePasswordStrength(newPassword, "New password");

  if (!isString(confirmPassword) || confirmPassword !== newPassword) {
    throw new ValidationError("Passwords do not match.");
  }

  return { currentPassword, newPassword, confirmPassword };
}

const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

export function validateQuestionSearchParams(params: URLSearchParams): QuestionSearchFilters {
  const filters: QuestionSearchFilters = {};

  const allowedParams = [
    "subject",
    "topic",
    "difficulty",
    "q",
    "limit",
    "page",
    "id",
    "paths",
    "ids",
    "year",
    "sourceExam",
    "bcsTerm",
    "paperId",
  ];
  const unexpected = [...params.keys()].filter((k) => !allowedParams.includes(k));
  if (unexpected.length > 0) {
    throw new ValidationError(`Unexpected query parameter(s): ${unexpected.join(", ")}.`);
  }

  const subject = params.get("subject");
  const topic = params.get("topic");
  const difficulty = params.get("difficulty");
  const q = params.get("q");
  const limit = params.get("limit");
  const page = params.get("page");
  const id = params.get("id");
  const paths = params.get("paths");
  const ids = params.get("ids");
  const year = params.get("year");
  const sourceExam = params.get("sourceExam");
  const bcsTerm = params.get("bcsTerm");
  const paperId = params.get("paperId");

  if (subject && subject.length > 0) filters.subject = subject;
  if (topic && topic.length > 0) filters.topic = topic;
  if (difficulty && difficulty.length > 0) {
    // Normalize to the stored Difficulty enum spelling (EASY/MEDIUM/HARD).
    const upper = difficulty.toUpperCase();
    if (!(DIFFICULTIES as readonly string[]).includes(upper)) {
      throw new ValidationError(
        `difficulty must be one of: ${DIFFICULTIES.join(", ").toLowerCase()}.`,
      );
    }
    filters.difficulty = upper;
  }
  if (q && q.length > 0) filters.q = q;
  if (bcsTerm && bcsTerm.length > 0) {
    if (bcsTerm.length > 20) {
      throw new ValidationError("bcsTerm must be at most 20 characters.");
    }
    filters.bcsTerm = bcsTerm;
  }
  if (paths && paths.length > 0) {
    filters.paths = paths
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  if (limit) {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("limit must be a positive integer.");
    }
    filters.limit = Math.min(parsed, 200);
  }

  if (page) {
    const parsed = Number(page);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("page must be a positive integer.");
    }
    filters.page = parsed;
  }

  if (id) {
    const parsed = Number(id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("id must be a positive integer.");
    }
    filters.id = parsed;
  }

  if (ids && ids.length > 0) {
    const parsed = ids
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        const n = Number(s);
        if (!Number.isInteger(n) || n <= 0) {
          throw new ValidationError("ids must be positive integers.");
        }
        return n;
      });
    // Cap the IN-clause so a giant id list can't become an abuse vector.
    if (parsed.length > 200) {
      throw new ValidationError("ids must contain at most 200 entries.");
    }
    if (parsed.length > 0) filters.ids = parsed;
  }

  if (year) {
    const parsed = Number(year);
    if (!Number.isInteger(parsed) || parsed < 1950 || parsed > 2100) {
      throw new ValidationError("year must be between 1950 and 2100.");
    }
    filters.year = parsed;
  }

  if (sourceExam && sourceExam.length > 0) {
    if (sourceExam.length > 40) {
      throw new ValidationError("sourceExam must be at most 40 characters.");
    }
    filters.sourceExam = sourceExam;
  }

  if (paperId) {
    const parsed = Number(paperId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("paperId must be a positive integer.");
    }
    filters.paperId = parsed;
  }

  return filters;
}

export function validatePagination(params: URLSearchParams): PaginationParams {
  let page = 1;
  let limit = 20;

  const pageParam = params.get("page");
  const limitParam = params.get("limit");

  if (pageParam) {
    const parsed = Number(pageParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("page must be a positive integer.");
    }
    page = parsed;
  }

  if (limitParam) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError("limit must be a positive integer.");
    }
    limit = Math.min(parsed, 100);
  }

  return { page, limit };
}

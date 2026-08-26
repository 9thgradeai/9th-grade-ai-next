// src/lib/services/user.ts — per-user state (progress, bookmarks).
// Must be called from server context with the authenticated userId.

import "server-only";

import crypto from "crypto";
import { hash, compare } from "bcryptjs";
import { prisma } from "~backend/db";
import { getSessionUser } from "~backend/auth";
import { sendEmail } from "~backend/lib/email";
import { log } from "~backend/infrastructure/observability/logger";
import {
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalServerError,
  UnauthorizedError,
  ForbiddenError,
} from "~backend/errors";

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  handle: string;
  passwordHash: string;
  tokenVersion: number;
  role: "student" | "admin";
  emailVerified: boolean;
  onboarded: boolean;
  createdAt: string;
};

export type OnboardingInput = {
  examTarget?: string;
  examDate?: string;
  prepLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  studyHoursPerDay?: number;
  goal?: string;
};

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour for password reset
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for email verification

/** Generate a high-entropy raw token and its SHA-256 hash (store the hash). */
function makeToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  const hashValue = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash: hashValue };
}

function sha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  try {
    const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      emailVerified: u.emailVerified,
      onboarded: u.onboarded,
      createdAt: u.createdAt.toISOString(),
    };
  } catch {
    throw new InternalServerError("Failed to fetch user by email");
  }
}

export async function createUser({
  name,
  email,
  password,
  handle = email.split("@")[0],
  origin,
}: {
  name: string;
  email: string;
  password: string;
  handle?: string;
  /** Request origin used to build the email-verification link. */
  origin?: string;
}): Promise<UserRecord> {
  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new ConflictError("A user with that email already exists.");
    }

    const passwordHash = await hash(password, 10);
    const { raw: verifyRaw, hash: verifyHash } = makeToken();

    // User + initial progress row commit atomically — a failure creating the
    // progress row rolls back the user instead of leaving an orphaned account
    // without progress. A concurrent registration with the same email hits the
    // unique constraint (inside or around the transaction) and surfaces as a
    // 409 conflict rather than a 500.
    const isUniqueViolation = (err: unknown): boolean =>
      !!err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2002";

    let u;
    try {
      u = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            name,
            email: email.toLowerCase(),
            handle,
            passwordHash,
            role: "STUDENT",
            emailVerifyToken: verifyHash,
            emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS),
          },
        });
        await tx.userProgress.create({ data: { userId: created.id } });
        return created;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError("A user with that email already exists.");
      }
      throw err;
    }

    // Best-effort verification email; never blocks registration. In dev with no
    // transport the link is logged server-side so the flow stays testable.
    if (origin) {
      const link = `${origin}/verify-email?token=${verifyRaw}`;
      const { sent } = await sendEmail({
        to: u.email,
        subject: "Verify your 9Th-Grade AI account",
        html: `<p>Welcome to 9Th-Grade AI. Confirm your email to secure your account:</p><p><a href="${link}">${link}</a></p>`,
      });
      if (!sent && process.env.NODE_ENV !== "production") {
        log.info("auth.verify.devlink", { email: u.email, link });
      }
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: "student",
      emailVerified: u.emailVerified,
      onboarded: u.onboarded,
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to create user");
  }
}

export async function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  try {
    return compare(plain, hashStr);
  } catch {
    return false;
  }
}

/**
 * Pre-computed bcrypt digest used to equalize timing when the submitted email
 * does not exist. Running the same single compare on both the "no such user"
 * and "wrong password" paths removes the ~100ms oracle that let attackers
 * enumerate registered emails from response latency.
 */
export const DUMMY_PASSWORD_HASH = "$2b$10$mfEU02aBWld.H0jui8HgCuZz9R1S7WV8QTsnKc3JsxZkLjC4WbMCK";

/** Resolve the authenticated user's id from the request cookies. */
export async function getUserIdFromRequest(
  req: Request,
): Promise<string | null> {
  try {
    // Delegates to getSessionUser so every session check (JWT signature,
    // existence, tokenVersion) stays in one place.
    const user = await getSessionUser(req);
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export type AuthedUser = { id: string; email: string; role: "student" | "admin" };

/** Resolve the authenticated user (id + role) from the request cookies. */
export async function getAuthedUser(req: Request): Promise<AuthedUser | null> {
  try {
    // Delegates to getSessionUser so every session check stays in one place.
    const user = await getSessionUser(req);
    if (!user) return null;
    return { id: user.id, email: user.email, role: user.role };
  } catch {
    return null;
  }
}

/**
 * Gate for admin-only surfaces. Throws UnauthorizedError (401) when no valid
 * session exists and ForbiddenError (403) when the session lacks the role.
 * Returns the authenticated user on success.
 */
export async function requireRole(
  req: Request,
  roles: Array<AuthedUser["role"]>,
): Promise<AuthedUser> {
  const user = await getAuthedUser(req);
  if (!user) {
    throw new UnauthorizedError("Authentication required");
  }
  if (!roles.includes(user.role)) {
    throw new ForbiddenError(`Requires one of: ${roles.join(", ")}`);
  }
  return user;
}

export async function getBookmarkedQuestionIds(userId: string): Promise<number[]> {
  try {
    const rows = await prisma.bookmark.findMany({
      where: { userId },
      select: { questionId: true },
    });
    return rows.map((r) => r.questionId);
  } catch {
    throw new InternalServerError("Failed to fetch bookmarks");
  }
}

export async function toggleBookmark(
  userId: string,
  questionId: number,
): Promise<{ bookmarked: boolean }> {
  try {
    const existing = await prisma.bookmark.findUnique({
      where: { userId_questionId: { userId, questionId } },
    });
    if (existing) {
      await prisma.bookmark.delete({ where: { userId_questionId: { userId, questionId } } });
      return { bookmarked: false };
    }
    await prisma.bookmark.create({ data: { userId, questionId } });
    return { bookmarked: true };
  } catch {
    throw new InternalServerError("Failed to toggle bookmark");
  }
}

export async function toggleStudyTask(
  userId: string,
  taskId: number,
): Promise<{ completed: boolean }> {
  try {
    // Any task may be toggled (template or user-created) — completion state is
    // per-user in StudyTaskCompletion, never on the shared row.
    const task = await prisma.studyTask.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new NotFoundError("Task not found");

    return prisma.$transaction(async (tx) => {
      const existing = await tx.studyTaskCompletion.findUnique({
        where: { userId_taskId: { userId, taskId } },
      });
      if (existing) {
        await tx.studyTaskCompletion.delete({ where: { id: existing.id } });
        return { completed: false };
      }
      await tx.studyTaskCompletion.create({ data: { userId, taskId } });
      return { completed: true };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to toggle study task");
  }
}

export async function findUserById(userId: string): Promise<UserRecord | null> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId } });
    if (!u) return null;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      emailVerified: u.emailVerified,
      onboarded: u.onboarded,
      createdAt: u.createdAt.toISOString(),
    };
  } catch {
    throw new InternalServerError("Failed to fetch user");
  }
}

export async function updateUserProfile(
  userId: string,
  patch: { name?: string },
): Promise<UserRecord> {
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError("User not found");

    const u = await prisma.user.update({
      where: { id: userId },
      data: { name: patch.name?.trim() ?? existing.name },
    });

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      emailVerified: u.emailVerified,
      onboarded: u.onboarded,
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to update profile");
  }
}

export async function changeUserPassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ tokenVersion: number }> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User not found");

    const match = await verifyPassword(user.passwordHash, currentPassword);
    if (!match) {
      throw new AppError(
        401,
        "Current password is incorrect.",
        "INVALID_CURRENT_PASSWORD",
      );
    }

    // Bumping tokenVersion invalidates every JWT minted before this point —
    // stolen cookies stop working after a password change. The caller issues
    // a fresh token for the CURRENT session so the user isn't logged out.
    const passwordHash = await hash(newPassword, 10);
    const tokenVersion = user.tokenVersion + 1;
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion },
    });
    return { tokenVersion };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to change password");
  }
}

/**
 * Invalidate every active session for the user ("log out everywhere") by
 * bumping their tokenVersion. Also affects the calling device — the client
 * clears its own cookie afterwards.
 */
export async function revokeAllSessions(userId: string): Promise<void> {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundError("User not found");
    await prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to revoke sessions");
  }
}

export async function deleteUserAccount(userId: string): Promise<void> {
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError("User not found");
    // Related rows cascade (see schema onDelete: Cascade / SetNull).
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to delete account");
  }
}

// ── Password reset ───────────────────────────────────────────

/**
 * Begin a password-reset flow. Always returns a positive result so the
 * response cannot be used to enumerate which emails are registered. When the
 * address matches a user we mint a single-use, 1-hour token (store only its
 * SHA-256 hash), email a reset link, and — in non-production with no email
 * transport — return the link so the flow stays manually testable.
 */
export async function requestPasswordReset(
  email: string,
  origin: string,
): Promise<{ devLink?: string }> {
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return {};

    const { raw, hash: tokenHash } = makeToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: tokenHash,
        passwordResetExpires: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    const link = `${origin}/reset-password?token=${raw}`;
    const { sent } = await sendEmail({
      to: user.email,
      subject: "Reset your 9Th-Grade AI password",
      html: `<p>We received a request to reset your 9Th-Grade AI password.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });

    if (!sent && process.env.NODE_ENV !== "production") {
      log.info("auth.reset.devlink", { email: user.email, link });
      return { devLink: link };
    }
    return {};
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to request password reset");
  }
}

/**
 * Consume a password-reset token. Validates the hash, expiry, and new
 * password, then rotates the password and bumps tokenVersion so every prior
 * session is invalidated. Clears the token either way on success.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  try {
    if (!isString(token) || token.length < 32) {
      throw new ValidationError("Invalid or expired reset link.");
    }
    if (!isString(newPassword) || newPassword.length < 8) {
      throw new ValidationError("Password must be at least 8 characters.");
    }

    const tokenHash = sha256(token);
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: tokenHash, passwordResetExpires: { gt: new Date() } },
    });
    if (!user) {
      throw new ValidationError("Invalid or expired reset link.");
    }

    const passwordHash = await hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        tokenVersion: { increment: 1 },
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to reset password");
  }
}

// ── Email verification ───────────────────────────────────────

/** Verify an email-confirmation token. Idempotent and safe to retry. */
export async function verifyEmail(token: string): Promise<{ ok: boolean }> {
  try {
    if (!isString(token) || token.length < 32) return { ok: false };
    const tokenHash = sha256(token);
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: tokenHash, emailVerifyExpires: { gt: new Date() } },
    });
    if (!user) return { ok: false };
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null, emailVerifyExpires: null },
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Onboarding ───────────────────────────────────────────────

function validateOnboarding(input: OnboardingInput): {
  examTarget?: string;
  examDate?: Date;
  prepLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  studyHoursPerDay?: number;
  goal?: string;
} {
  const out: {
    examTarget?: string;
    examDate?: Date;
    prepLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
    studyHoursPerDay?: number;
    goal?: string;
  } = {};

  if (input.examTarget != null) {
    if (!isString(input.examTarget) || input.examTarget.trim().length === 0 || input.examTarget.length > 120) {
      throw new ValidationError("Exam target must be between 1 and 120 characters.");
    }
    out.examTarget = input.examTarget.trim();
  }
  if (input.examDate != null) {
    const date = new Date(input.examDate);
    if (Number.isNaN(date.getTime())) {
      throw new ValidationError("Exam date is not a valid date.");
    }
    out.examDate = date;
  }
  if (input.prepLevel != null) {
    if (!["BEGINNER", "INTERMEDIATE", "ADVANCED"].includes(input.prepLevel)) {
      throw new ValidationError("Prep level must be BEGINNER, INTERMEDIATE, or ADVANCED.");
    }
    out.prepLevel = input.prepLevel;
  }
  if (input.studyHoursPerDay != null) {
    const n = Number(input.studyHoursPerDay);
    if (!Number.isInteger(n) || n < 0 || n > 24) {
      throw new ValidationError("Study hours per day must be a whole number between 0 and 24.");
    }
    out.studyHoursPerDay = n;
  }
  if (input.goal != null) {
    if (!isString(input.goal) || input.goal.trim().length === 0 || input.goal.length > 280) {
      throw new ValidationError("Goal must be between 1 and 280 characters.");
    }
    out.goal = input.goal.trim();
  }
  return out;
}

/** Persist onboarding answers and mark the user onboarded. */
export async function completeOnboarding(
  userId: string,
  input: OnboardingInput,
): Promise<UserRecord> {
  try {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) throw new NotFoundError("User not found");

    const data = validateOnboarding(input);
    const u = await prisma.user.update({
      where: { id: userId },
      data: { ...data, onboarded: true },
    });

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      handle: u.handle,
      passwordHash: u.passwordHash,
      tokenVersion: u.tokenVersion,
      role: u.role === "ADMIN" ? "admin" : "student",
      emailVerified: u.emailVerified,
      onboarded: u.onboarded,
      createdAt: u.createdAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new InternalServerError("Failed to save onboarding");
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

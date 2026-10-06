/* --------------------------------------------------------------
   auth.ts — Server-side auth helpers (JWT session management)
   Uses `jose` for JWT signing/verification and Next.js cookie helpers.
   Must be imported from `server-only` in a server context.
   -------------------------------------------------------------- */

import "server-only";
import * as crypto from "crypto";

import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import type { UserRecord } from "~backend/services/user";

// Lazy secret initialization with rotation support. The env value is
// re-read at most once per minute, so an AUTH_SECRET rotation propagates
// without a redeploy — while verification still accepts the previous secret
// during the grace window (old cookies stay valid, new cookies use new key).
let JOSE_SECRET: Uint8Array | null = null;
let JOSE_SECRET_PREV: Uint8Array | null = null;
let SECRET_LOADED_AT = 0;
const SECRET_TTL_MS = 60_000;

function encodeSecret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function loadSecrets(): { current: Uint8Array; previous: Uint8Array | null } {
  const now = Date.now();
  if (JOSE_SECRET && now - SECRET_LOADED_AT < SECRET_TTL_MS) {
    return { current: JOSE_SECRET, previous: JOSE_SECRET_PREV };
  }
  const current = process.env.AUTH_SECRET;
  if (!current) {
    if (process.env.NODE_ENV !== "production") {
      // In development, generate a temporary secret to avoid crashes.
      const dev = crypto.randomBytes(32).toString("base64");
      console.warn("[auth] AUTH_SECRET not set – using temporary dev secret.");
      JOSE_SECRET = encodeSecret(dev);
      JOSE_SECRET_PREV = null;
      SECRET_LOADED_AT = now;
      return { current: JOSE_SECRET, previous: null };
    }
    throw new Error(
      "AUTH_SECRET is not set. Create a .env.local with AUTH_SECRET=$(openssl rand -base64 32).",
    );
  }
  // Rotation: the outgoing value becomes the grace-window verifier.
  if (JOSE_SECRET && !timingSafeEqualText(encodeSecret(current), JOSE_SECRET)) {
    JOSE_SECRET_PREV = JOSE_SECRET;
  }
  JOSE_SECRET = encodeSecret(current);
  // AUTH_SECRET_PREVIOUS extends the grace window across restarts (env-set).
  const prevEnv = process.env.AUTH_SECRET_PREVIOUS;
  if (prevEnv) JOSE_SECRET_PREV = encodeSecret(prevEnv);
  SECRET_LOADED_AT = now;
  return { current: JOSE_SECRET, previous: JOSE_SECRET_PREV };
}

function timingSafeEqualText(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function getJoseSecret(): Uint8Array {
  return loadSecrets().current;
}

/** Previous secret for the rotation grace window (null when none). */
function getJoseSecretPrevious(): Uint8Array | null {
  return loadSecrets().previous;
}


// Cookie name used across all API routes
const SESSION_COOKIE = "auth_token";

// Max concurrent sessions per user
const MAX_CONCURRENT_SESSIONS = 5;

// Session lifetimes. Standard sessions live 7 days; "remember me" sessions
// live 30 days (JWT exp + cookie + session-list window must ALL agree —
// previously the cookie said 30d while the JWT said 7d, so remember-me users
// died on day 7 with a confusing failure). The session-list prune window
// covers the longest lifetime; JWT exp remains the real gate for short ones.
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const REMEMBER_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_PRUNE_MS = REMEMBER_SESSION_MS;

// Session metadata stored in JWT and user.sessions JSON
type SessionMeta = {
  id: string;
  createdAt: string; // ISO timestamp
  userAgent?: string;
  ip?: string;
};

function parseSessions(json: unknown): SessionMeta[] {
  if (!json) return [];
  try {
    // Prisma returns Json columns already parsed (array/object), not a string.
    // Accept all three shapes; anything else resolves to [] (no sessions).
    const arr: unknown =
      typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (s): s is SessionMeta =>
        !!s && typeof s === "object" && typeof (s as SessionMeta).id === "string",
    );
  } catch {
    return [];
  }
}

function serializeSessions(sessions: SessionMeta[]): string {
  return JSON.stringify(sessions);
}

/**
 * Add a new session to user's session list, enforcing max concurrency.
 * Returns the updated session list and the new session ID.
 */
async function addUserSession(userId: string, session: SessionMeta): Promise<SessionMeta[]> {
  // Atomic read-modify-write inside a transaction so concurrent logins
  // cannot clobber each other's sessions or bypass the concurrency cap.
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { sessions: true } });
    const sessions = parseSessions(user?.sessions ?? "[]");

    // Remove expired sessions (older than the longest supported lifetime)
    const cutoff = Date.now() - SESSION_PRUNE_MS;
    const active = sessions.filter((s) => new Date(s.createdAt).getTime() > cutoff);

    // If at limit, remove oldest
    if (active.length >= MAX_CONCURRENT_SESSIONS) {
      active.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      active.shift(); // remove oldest
    }

    active.push(session);
    await tx.user.update({
      where: { id: userId },
      data: { sessions: serializeSessions(active) },
    });
    return active;
  });
}

/**
 * Remove a session from user's session list (on logout).
 */
async function removeUserSession(userId: string, sessionId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { sessions: true } });
    const sessions = parseSessions(user?.sessions ?? "[]");
    const filtered = sessions.filter((s) => s.id !== sessionId);
    await tx.user.update({
      where: { id: userId },
      data: { sessions: serializeSessions(filtered) },
    });
  });
}

/**
 * Get active session count for a user.
 */
async function getActiveSessionCount(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessions: true } });
  const sessions = parseSessions(user?.sessions ?? "[]");
  const cutoff = Date.now() - SESSION_PRUNE_MS;
  return sessions.filter((s) => new Date(s.createdAt).getTime() > cutoff).length;
}

/**
 * Contain a post-auth redirect to this origin only. OAuth and other flows take
 * a `?redirect=` parameter; without this an attacker could bounce a
 * just-authenticated user to an external site (open-redirect / phishing).
 * Accepts absolute same-origin URLs and relative paths; everything else falls
 * back to `/dashboard`. Relative paths must start with a single "/" and must
 * not be protocol-relative ("//evil.com").
 */
export function safeRedirect(target: string | null | undefined): string {
  if (!target) return "/dashboard";
  if (target.startsWith("//") || target.includes("://") || target.startsWith("@")) {
    return "/dashboard";
  }
  if (target.startsWith("/")) return target;
  try {
    const url = new URL(target);
    if (url.origin === new URL(process.env.APP_URL ?? "https://app.local").origin) {
      return target;
    }
  } catch {
    // not an absolute URL
  }
  return "/dashboard";
}

/**
 * Extract the session token from the request's Cookie header.
 * Uses an exact-boundary pattern (`^` or `; ` before the name) so decoy
 * cookies like `xauth_token=` cannot shadow the real session value.
 */
export function extractSessionToken(req: Request): string | null {
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(/(?:^|;\s*)auth_token=([^;]*)/);
  const raw = match?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

// ----- Helpers ---------------------------------------------------

/**
 * Sign a session JWT payload and return the string token.
 * Default 7-day expiry (pass `expiresIn` for remember-me / capped refresh).
 * Sets algorithm explicitly to HS256.
 * `expiresIn` is a jose timespan string ("7d") or a Date. NOTE: a raw
 * number is an epoch timestamp in jose, NOT a duration — never pass seconds
 * here (passing 604800 once minted instantly-expired 1970 tokens).
 * `origIat` (optional, seconds) preserves the ORIGINAL issue time across
 * refresh hops so the refresh endpoint can enforce an absolute session cap.
 * `ver` is the user's tokenVersion — bumped server-side to revoke all tokens
 * issued before it (password change, logout-everywhere).
 * `sid` is the session ID for concurrency tracking.
 */
export async function signSession(
  payload: { email: string; origIat?: number; ver?: number; sid?: string },
  expiresIn: string | Date = "7d",
) {
  const claims: Record<string, unknown> = { email: payload.email };
  if (typeof payload.origIat === "number") {
    claims.origIat = payload.origIat;
  }
  if (typeof payload.ver === "number") {
    claims.ver = payload.ver;
  }
  if (typeof payload.sid === "string") {
    claims.sid = payload.sid;
  }
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getJoseSecret());
}

/**
 * Verify a JWT token string and return the decoded payload.
 * Returns `null` on any verification failure (expired, bad sig, etc.).
 */
export async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJoseSecret(), {
      algorithms: ["HS256"],
    });
    return payload;
  } catch {
    // Rotation grace window: tokens minted just before a rotation still verify.
    const prev = getJoseSecretPrevious();
    if (!prev) return null;
    try {
      const { payload } = await jwtVerify(token, prev, {
        algorithms: ["HS256"],
      });
      return payload;
    } catch {
      return null;
    }
  }
}

/**
 * Set an HttpOnly, SameSite=Lax, Secure-in-prod cookie with the JWT.
 * Called from API route responders.
 * @param token - the signed JWT
 * @param res - NextResponse (or Next.js route handler response)
 */
/**
 * Set an HttpOnly, SameSite=Lax, Secure-in-prod cookie with the JWT.
 * Called from API route responders.
 * @param token - the signed JWT
 * @param res - NextResponse (or Next.js route handler response)
 * @param maxAgeSeconds - cookie lifetime in seconds. Defaults to 7 days;
 *   pass a longer value (e.g. 30 days) when the user opts to stay signed in.
 */
export async function setSessionCookie(token: string, res: NextResponse, maxAgeSeconds?: number) {
  // Deliberately SameSite=Lax (not Strict, not __Host-): the Google OAuth
  // callback is a cross-site top-level navigation that must carry the
  // session cookie, and __Host- would invalidate every existing session on
  // rename. CSRF on state-changing routes is enforced by assertSameOrigin.
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds ?? 60 * 60 * 24 * 7,
  };
  res.cookies.set(SESSION_COOKIE, token, cookieOpts);
}

/**
 * Clear the session cookie by setting it to an expired past date.
 * Called from the logout API route.
 * @param res - NextResponse
 */
export async function clearSessionCookie(res: NextResponse) {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  };
  res.cookies.set(SESSION_COOKIE, "", cookieOpts);
}

/**
 * Read the authenticated user from the request cookies.
 * Verifies the JWT, then loads the user from the database by email.
 * Sessions are stateless (JWT-only); no in-memory or DB session row is used.
 * @param req - the incoming Request
 * @returns UserRecord if authenticated, null otherwise
 */
export async function getSessionUser(req: Request): Promise<UserRecord | null> {
  const token = extractSessionToken(req);
  if (!token) return null;
  // NOTE: deliberately uncached. This is a single PK lookup (~1ms), while
  // any cache would delay ban/tokenVersion revocation. Correctness wins.
  const payload = await verifySession(token);
  if (!payload?.email || typeof payload.email !== "string") return null;

  const u = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!u) return null;

  // Banned users lose all access immediately, even with an unexpired JWT.
  // (Ban also bumps tokenVersion via revokeAllSessions; this is belt-and-braces.)
  // `as string` avoids narrowing `u.role` — the mapping below still needs the
  // full STUDENT | ADMIN | BANNED union.
  if ((u.role as string) === "BANNED") return null;

  // Session-version check: tokens minted before the user's current
  // tokenVersion (password change / revoke-all) are dead even if unexpired.
  // Legacy tokens without a `ver` claim count as version 0.
  const ver = typeof (payload as { ver?: unknown }).ver === "number"
    ? ((payload as { ver: number }).ver)
    : 0;
  if (ver !== u.tokenVersion) return null;

  // Session ID check: validate this session is still in user's active sessions
  const sid = typeof (payload as { sid?: unknown }).sid === "string"
    ? ((payload as { sid: string }).sid)
    : null;
  if (sid) {
    const sessions = parseSessions(u.sessions ?? "[]");
    const cutoff = Date.now() - SESSION_PRUNE_MS;
    const active = sessions.filter((s) => new Date(s.createdAt).getTime() > cutoff);
    if (!active.some((s) => s.id === sid)) {
      return null; // Session revoked (concurrency limit or manual logout)
    }
  }

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    handle: u.handle,
    // NOTE: passwordHash is deliberately absent — the session DTO must never
    // carry credential material (Phase 0 hardening).
    tokenVersion: u.tokenVersion,
    role: u.role === "ADMIN" ? "admin" : u.role === "BANNED" ? "banned" : "student",
    emailVerified: u.emailVerified,
    onboarded: u.onboarded,
    createdAt: u.createdAt.toISOString(),
    authProvider: (u.authProvider as "password" | "google" | "both") ?? "password",
    imageUrl: u.imageUrl ?? undefined,
    examTarget: u.examTarget ?? undefined,
    examDate: u.examDate ? u.examDate.toISOString() : undefined,
    prepLevel: (u.prepLevel as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | undefined) ?? undefined,
    studyHoursPerDay: u.studyHoursPerDay ?? undefined,
    goal: u.goal ?? undefined,
  };
}

// Export session tracking functions
export { addUserSession, removeUserSession, getActiveSessionCount, type SessionMeta, MAX_CONCURRENT_SESSIONS };

// ----- Server-only enforcement -------------------------------
//
// Import this only from server components or API routes (not client).
// If you import from a client component you will get a runtime error.
// In client code use the `useAuth` hook from `src/lib/auth-context.tsx` instead.
//
//   import { signSession, verifySession, setSessionCookie } from "~backend/auth";
//
// The `useEffect` in `AuthProvider` should fetch `/api/auth/me` —
// that endpoint calls `verifySession` and returns the user safely.

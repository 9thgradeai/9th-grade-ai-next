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

// Session metadata stored in JWT and the Session table.
type SessionMeta = {
  id: string;
  createdAt: string; // ISO timestamp
  userAgent?: string;
  ip?: string;
};

/**
 * Add a new session to the Session table, enforcing max concurrency.
 * Lock-free (no User row transaction): expired rows are pruned, then the
 * oldest rows past the cap are evicted. Concurrent logins converge on the
 * cap on the next write instead of serializing on a row lock.
 * Returns the updated active session list and the new session ID.
 */
async function addUserSession(userId: string, session: SessionMeta): Promise<SessionMeta[]> {
  const createdAt = new Date(session.createdAt);
  const createdMs = createdAt.getTime();
  const expiresAt = new Date(
    (Number.isFinite(createdMs) ? createdMs : Date.now()) + SESSION_PRUNE_MS,
  );
  await prisma.session.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
  await prisma.session.create({
    data: {
      id: session.id,
      userId,
      createdAt: Number.isFinite(createdMs) ? createdAt : new Date(),
      expiresAt,
      userAgent: session.userAgent ?? null,
      ip: session.ip ?? null,
    },
  });
  // Evict oldest past the cap (keep newest MAX_CONCURRENT_SESSIONS).
  const newest = await prisma.session.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: MAX_CONCURRENT_SESSIONS,
  });
  const keep = new Set(newest.map((s) => s.id));
  if (keep.size >= MAX_CONCURRENT_SESSIONS) {
    await prisma.session.deleteMany({
      where: { userId, id: { notIn: [...keep] } },
    });
  }
  const active = await prisma.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return active.map(toSessionMeta);
}

function toSessionMeta(s: {
  id: string;
  createdAt: Date;
  userAgent: string | null;
  ip: string | null;
}): SessionMeta {
  return {
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    ...(s.userAgent ? { userAgent: s.userAgent } : {}),
    ...(s.ip ? { ip: s.ip } : {}),
  };
}

/**
 * Remove a session (on logout).
 */
async function removeUserSession(userId: string, sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId, id: sessionId } });
}

/**
 * Get active session count for a user.
 */
async function getActiveSessionCount(userId: string): Promise<number> {
  return prisma.session.count({
    where: { userId, expiresAt: { gt: new Date() } },
  });
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
 * Sid-bearing tokens are checked against the Session table.
 *
 * Per-request memoized (server-cache-react): repeated auth checks with the
 * same Request object (handler + service helpers, layout + page composition)
 * share one verify + lookup instead of stampeding the DB. Scope is strictly
 * one Request identity — a new request (or test) always re-resolves, so bans
 * and tokenVersion revocations still take effect immediately on the next
 * request. Keyed by object identity (not React.cache()) so unit tests that
 * build their own Request per case stay isolated with no shared-state leakage.
 * @param req - the incoming Request
 * @returns UserRecord if authenticated, null otherwise
 */
const sessionUserMemo = new WeakMap<Request, Promise<UserRecord | null>>();

export function getSessionUser(req: Request): Promise<UserRecord | null> {
  const hit = sessionUserMemo.get(req);
  if (hit) return hit;
  const p = loadSessionUser(req);
  sessionUserMemo.set(req, p);
  return p;
}

async function loadSessionUser(req: Request): Promise<UserRecord | null> {
  const token = extractSessionToken(req);
  if (!token) return null;
  // NOTE: cached per-Request only (see getSessionUser). This stays a live
  // lookup on every new request, so ban/tokenVersion revocation is never
  // delayed across requests. Correctness wins.
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

  // Session ID check: the session must exist in the Session table and be
  // unexpired. Anything else is revoked (concurrency limit or logout).
  const sid = typeof (payload as { sid?: unknown }).sid === "string"
    ? ((payload as { sid: string }).sid)
    : null;
  if (sid) {
    const row = await prisma.session.findFirst({
      where: { id: sid, userId: u.id, expiresAt: { gt: new Date() } },
    });
    if (!row) {
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

/* --------------------------------------------------------------
   auth.ts — Server-side auth helpers (JWT session management)
   Uses `jose` for JWT signing/verification and Next.js cookie helpers.
   Must be imported from `server-only` in a server context.
   -------------------------------------------------------------- */

import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { prisma } from "~backend/db";
import type { UserRecord } from "~backend/services/user";

// Lazy secret initialization
let JOSE_SECRET: Uint8Array | null = null;

function getJoseSecret(): Uint8Array {
  if (JOSE_SECRET) return JOSE_SECRET;
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET is not set. Create a .env.local with AUTH_SECRET=$(openssl rand -base64 32).",
    );
  }
  const encoder = new TextEncoder();
  JOSE_SECRET = encoder.encode(secret);
  return JOSE_SECRET;
}

// Cookie name used across all API routes
const SESSION_COOKIE = "auth_token";

/**
 * Extract the session token from the request's Cookie header.
 * Uses an exact-boundary pattern (`^` or `; ` before the name) so decoy
 * cookies like `xauth_token=` cannot shadow the real session value.
 */
export function extractSessionToken(req: Request): string | null {
  const header = req.headers.get("cookie") ?? "";
  const match = header.match(/(?:^|;\s*)auth_token=([^;]*)/);
  return match?.[1] || null;
}

// ----- Helpers ---------------------------------------------------

/**
 * Sign a session JWT payload (usually `{ email }`) and return the string token.
 * 7-day expiry. Sets algorithm explicitly to HS256.
 * `origIat` (optional, seconds) preserves the ORIGINAL issue time across
 * refresh hops so the refresh endpoint can enforce an absolute session cap.
 * `ver` is the user's tokenVersion — bumped server-side to revoke all tokens
 * issued before it (password change, logout-everywhere).
 */
export async function signSession(
  payload: { email: string; origIat?: number; ver?: number },
) {
  const claims: Record<string, unknown> = { email: payload.email };
  if (typeof payload.origIat === "number") {
    claims.origIat = payload.origIat;
  }
  if (typeof payload.ver === "number") {
    claims.ver = payload.ver;
  }
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
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
    return null;
  }
}

/**
 * Set an HttpOnly, SameSite=Lax, Secure-in-prod cookie with the JWT.
 * Called from API route responders.
 * @param token - the signed JWT
 * @param res - NextResponse (or Next.js route handler response)
 */
export async function setSessionCookie(token: string, res: NextResponse) {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
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

  const payload = await verifySession(token);
  if (!payload?.email || typeof payload.email !== "string") return null;

  const u = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!u) return null;

  // Session-version check: tokens minted before the user's current
  // tokenVersion (password change / revoke-all) are dead even if unexpired.
  // Legacy tokens without a `ver` claim count as version 0.
  const ver = typeof (payload as { ver?: unknown }).ver === "number"
    ? ((payload as { ver: number }).ver)
    : 0;
  if (ver !== u.tokenVersion) return null;

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    handle: u.handle,
    passwordHash: u.passwordHash,
    tokenVersion: u.tokenVersion,
    role: u.role === "ADMIN" ? "admin" : "student",
    createdAt: u.createdAt.toISOString(),
  };
}

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

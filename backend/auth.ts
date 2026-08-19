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

// ----- Helpers ---------------------------------------------------

/**
 * Sign a session JWT payload (usually `{ email }`) and return the string token.
 * 7-day expiry. Sets algorithm explicitly to HS256.
 */
export async function signSession(payload: { email: string }) {
  return await new SignJWT(payload)
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
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(/auth_token=([^;]+)/);
  if (!match) return null;

  const token = match[1];

  const payload = await verifySession(token);
  if (!payload?.email || typeof payload.email !== "string") return null;

  const u = await prisma.user.findUnique({ where: { email: payload.email } });
  if (!u) return null;

  return {
    id: u.id,
    name: u.name,
    email: u.email,
    handle: u.handle,
    passwordHash: u.passwordHash,
    role: u.role === "ADMIN" ? "admin" : "student",
    createdAt: u.createdAt.toISOString(),
  };
}



// Google OAuth support
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export async function googleAuthUrl(): Promise<string | null> {
  if (!GOOGLE_CLIENT_ID) return null;
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/api/auth/google/callback',
    response_type: 'code',
    scope: 'profile email',
    access_type: 'offline',
    prompt: 'consent',
  });
  return "https://accounts.google.com/o/oauth2/authorize?" + params;
}

export async function googleCallback(code: string): Promise<{ email: string; name: string; handle: string } | null> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return null;
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return null;
    const { access_token } = await tokenRes.json();
    const userRes = await fetch("https://oauth2.googleapis.com/tokeninfo?access_token=" + access_token);
    if (!userRes.ok) return null;
    const googleUser = await userRes.json();
    return { email: googleUser.email, name: googleUser.name, handle: googleUser.email.split('@')[0] };
  } catch {
    return null;
  }
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

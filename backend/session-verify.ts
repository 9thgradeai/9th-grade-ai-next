// backend/session-verify.ts
// ----------------------------------------------------------------------------
// Edge-safe session-token verification for proxy.ts (this project's
// middleware). Deliberately dependency-light:
//   • NO "server-only" import  — middleware is neither client nor node-server
//   • NO prisma import         — edge runtime cannot use the native query engine
//
// This checks JWT signature + expiry ONLY. Deep validation (user existence,
// tokenVersion revocation) stays in ~backend/auth getSessionUser, which runs
// inside route handlers with DB access.
// ----------------------------------------------------------------------------

import { jwtVerify } from "jose";

export const SESSION_COOKIE_NAME = "auth_token";

/**
 * Cryptographically validate a session JWT (signature + expiry, HS256).
 * Returns false for missing/garbage/expired tokens. When no secret is
 * configured the check fails closed (treated as unauthenticated) — callers
 * that must keep working without a secret handle that at their boundary.
 */
export async function isValidSessionToken(
  token: string | undefined | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Extract the session cookie value from a NextRequest-like cookies object. */
export function readSessionCookie(
  cookies: { get(name: string): { value: string } | undefined },
): string | null {
  return cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

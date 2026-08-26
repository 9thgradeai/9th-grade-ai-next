import { NextResponse, type NextRequest } from "next/server";
import { isValidSessionToken, readSessionCookie } from "~backend/session-verify";

const PROTECTED_PREFIXES = ["/dashboard"];
const AUTH_ROUTES = ["/login"];

function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // microphone=(self): Voice AI Tutor needs top-level document mic access.
  "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
};

/**
 * Session gate for page routes.
 *
 * The cookie is CRYPTOGRAPHICALLY verified (signature + expiry), not merely
 * probed for presence. A stale/garbage cookie therefore counts as signed-out:
 *   • /dashboard  → redirect to /login   (no more blank-page redirect loops)
 *   • /login      → bounce to /dashboard ONLY with a genuinely valid session
 *
 * Deep checks (user existence, tokenVersion revocation) remain in the route
 * handlers — the edge only decides which PAGE makes sense to render.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verify once per request; API routes re-validate deeply on their own.
  const token = readSessionCookie(request.cookies);
  const hasSession =
    token !== null && (await isValidSessionToken(token, process.env.AUTH_SECRET));

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthRoute = AUTH_ROUTES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isProtected && !hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  if (request.method === "OPTIONS") {
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  }

  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  response.headers.set("X-Request-ID", generateRequestId());

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login/:path*", "/api/:path*"],
};

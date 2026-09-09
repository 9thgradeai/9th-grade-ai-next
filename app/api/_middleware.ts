import { NextResponse } from "next/server";
import { AppError } from "~backend/errors";
import { randomUUID } from "crypto";

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

/**
 * Defense-in-depth CSRF check for state-changing requests. Browsers always
 * attach an Origin header to cross-site POST/PATCH/DELETE; if it names a
 * different host than the one serving the request, reject. Non-browser
 * clients (curl, server-to-server) send no Origin and are unaffected —
 * they carry no ambient cookie credentials anyway.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return;

  // Behind proxies the effective host can arrive via x-forwarded-host.
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";

  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError(403, "Invalid request origin.", "CSRF_ORIGIN_INVALID");
  }

  if (originHost && originHost !== host) {
    throw new AppError(403, "Cross-origin request rejected.", "CSRF_ORIGIN_MISMATCH");
  }
}

export function startTiming() {
  const start = Date.now();
  return () => Date.now() - start;
}

export function applyCorsHeaders(res: Response, origin: string = getAllowedOrigin()) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
}

export function applySecurityHeaders(res: Response) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Content Security Policy
//   res.headers.set(
//     "Content-Security-Policy",
//     "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https:; frame-ancestors 'none';"
//   );
  // Additional security headers
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("X-Download-Options", "noopen");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set("X-YSS-Protection", "1; mode=block");
}

export function applyCacheHeaders(
  res: Response,
  options: {
    maxAge?: number;
    public?: boolean;
    etag?: string;
    staleWhileRevalidate?: number;
  } = {},
) {
  const { maxAge = 0, public: isPublic = false, etag, staleWhileRevalidate } = options;
  const parts = [isPublic ? "public" : "private", `max-age=${maxAge}`];
  if (staleWhileRevalidate !== undefined) {
    parts.push(`stale-while-revalidate=${staleWhileRevalidate}`);
  }
  res.headers.set("Cache-Control", parts.join(", "));
  if (etag) {
    res.headers.set("ETag", etag);
  }
}

export function jsonResponse<T>(
  data: T,
  init?: ResponseInit,
): NextResponse {
  return NextResponse.json(data, init);
}

// Helper to get allowed origin based on environment
function getAllowedOrigin(): string {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
  const requestOrigin = typeof window !== "undefined" ? window.location.origin : "";
  
  // In development, allow localhost
  if (process.env.NODE_ENV === "development") {
    return requestOrigin || "*";
  }
  
  // In production, check against allowed origins
  if (allowedOrigins.length > 0 && requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }
  
  // Fallback to first allowed origin or empty string (which will be replaced by frontend)
  return allowedOrigins[0] || "";
}
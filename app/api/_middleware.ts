import { NextResponse } from "next/server";

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function startTiming() {
  const start = Date.now();
  return () => Date.now() - start;
}

export function applyCorsHeaders(res: Response, origin = "*") {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.headers.set("Access-Control-Max-Age", "86400");
}

export function applySecurityHeaders(res: Response) {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
}

export function applyCacheHeaders(
  res: Response,
  options: { maxAge?: number; public?: boolean; etag?: string } = {},
) {
  const { maxAge = 0, public: isPublic = false, etag } = options;
  const directive = isPublic ? `public, max-age=${maxAge}` : `private, max-age=${maxAge}`;
  res.headers.set("Cache-Control", directive);
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

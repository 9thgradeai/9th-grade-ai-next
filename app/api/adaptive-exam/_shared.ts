// app/api/adaptive-exam/_shared.ts
// Thin-route helpers shared by every Adaptive Exam endpoint: authentication,
// same-origin protection, rate limiting, strict DTO validation and uniform
// response headers. No business logic lives in route handlers.

import { NextResponse } from "next/server";
import { AppError, toHttpResponse } from "~backend/errors";
import { getUserIdFromRequest, requireRole } from "~backend/services/user";
import type { AdaptiveExecutionContext } from "~backend/services/adaptive-exam/contracts";
import { createDefaultAdaptiveServices } from "~backend/services/adaptive-exam/orchestrator-factory";
import {
  applySecurityHeaders,
  assertSameOrigin,
  getRequestId,
  startTiming,
} from "~app/api/_middleware";

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(userId: string, bucket: string): void {
  const key = `${bucket}:${userId}`;
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (current.count >= RATE_LIMIT) {
    throw new AppError(429, "Too many adaptive exam requests.", "ADAPTIVE_RATE_LIMITED");
  }
  current.count += 1;
}

export function asRecord(value: unknown, name = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError(400, `${name} must be a JSON object.`, "VALIDATION_ERROR");
  }
  return value as Record<string, unknown>;
}

export function assertNoUnknownFields(
  body: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const permitted = new Set(allowed);
  for (const key of Object.keys(body)) {
    if (!permitted.has(key)) {
      throw new AppError(400, `Unexpected field: ${key}.`, "VALIDATION_ERROR");
    }
  }
}

export function assertNoBodyUserId(body: Record<string, unknown>): void {
  if ("userId" in body) {
    throw new AppError(400, "userId is derived from the session and cannot be sent in the body.", "VALIDATION_ERROR");
  }
}

export function requireString(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; pattern?: RegExp } = {},
): string {
  const value = body[key];
  if (typeof value !== "string") {
    throw new AppError(400, `${key} must be a string.`, "VALIDATION_ERROR");
  }
  if (options.min !== undefined && value.length < options.min) {
    throw new AppError(400, `${key} is too short.`, "VALIDATION_ERROR");
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new AppError(400, `${key} is too long.`, "VALIDATION_ERROR");
  }
  if (options.pattern && !options.pattern.test(value)) {
    throw new AppError(400, `${key} has an invalid format.`, "VALIDATION_ERROR");
  }
  return value;
}

export function optionalString(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number } = {},
): string | undefined {
  if (body[key] === undefined) return undefined;
  return requireString(body, key, options);
}

export function requireInteger(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number } = {},
): number {
  const value = body[key];
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new AppError(400, `${key} must be an integer.`, "VALIDATION_ERROR");
  }
  if (options.min !== undefined && value < options.min) {
    throw new AppError(400, `${key} is below the allowed minimum.`, "VALIDATION_ERROR");
  }
  if (options.max !== undefined && value > options.max) {
    throw new AppError(400, `${key} exceeds the allowed maximum.`, "VALIDATION_ERROR");
  }
  return value;
}

export function requireBoolean(body: Record<string, unknown>, key: string): boolean {
  const value = body[key];
  if (typeof value !== "boolean") {
    throw new AppError(400, `${key} must be a boolean.`, "VALIDATION_ERROR");
  }
  return value;
}

export function requireEnum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const value = body[key];
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new AppError(400, `${key} has an invalid value.`, "VALIDATION_ERROR");
  }
  return value as T;
}

export function optionalEnum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T | undefined {
  if (body[key] === undefined) return undefined;
  return requireEnum(body, key, allowed);
}

export function requireStringArray(
  body: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number; itemMax?: number } = {},
): string[] {
  const value = body[key];
  if (!Array.isArray(value)) {
    throw new AppError(400, `${key} must be an array.`, "VALIDATION_ERROR");
  }
  if (options.min !== undefined && value.length < options.min) {
    throw new AppError(400, `${key} must contain at least ${options.min} items.`, "VALIDATION_ERROR");
  }
  if (options.max !== undefined && value.length > options.max) {
    throw new AppError(400, `${key} has too many items.`, "VALIDATION_ERROR");
  }
  return value.map((item, index) => {
    if (typeof item !== "string" || item.length === 0 || item.length > (options.itemMax ?? 200)) {
      throw new AppError(400, `${key}[${index}] is invalid.`, "VALIDATION_ERROR");
    }
    return item;
  });
}

export function finalize(response: NextResponse, requestId: string, elapsed: () => number): NextResponse {
  response.headers.set("X-Request-Id", requestId);
  response.headers.set("X-Response-Time", `${elapsed()}ms`);
  applySecurityHeaders(response);
  return response;
}

type RouteOptions<T> = {
  bucket: string;
  needBody?: boolean;
  handler: (input: {
    request: Request;
    userId: string;
    requestId: string;
    body: Record<string, unknown>;
    correlationId?: string;
  }) => Promise<T>;
  adminOnly?: boolean;
};

/**
 * Auth + origin + rate limit + body parsing, then a single service delegation.
 * `userId` is always taken from the session cookie, never from the request body.
 */
export async function runAdaptiveRoute<T>(
  request: Request,
  options: RouteOptions<T>,
): Promise<NextResponse> {
  const requestId = getRequestId(request);
  const getTime = startTiming();
  try {
    assertSameOrigin(request);
    const userId = options.adminOnly
      ? (await requireRole(request, ["admin"])).id
      : await getUserIdFromRequest(request);
    if (!userId) {
      throw new AppError(401, "Authentication required.", "ADAPTIVE_UNAUTHORIZED");
    }
    enforceRateLimit(userId, options.bucket);

    let body: Record<string, unknown> = {};
    if (options.needBody) {
      const parsed = await request.json().catch(() => null);
      body = asRecord(parsed);
      assertNoBodyUserId(body);
    }

    const result = await options.handler({ request, userId, requestId, body });
    return finalize(NextResponse.json(result), requestId, getTime);
  } catch (error) {
    return finalize(toHttpResponse(error), requestId, getTime);
  }
}

export async function adaptiveContext(
  userId: string,
  requestId: string,
  correlationId?: string,
): Promise<AdaptiveExecutionContext> {
  const services = await createDefaultAdaptiveServices();
  return {
    userId,
    requestId,
    ...(correlationId ? { correlationId } : {}),
    // The orchestrator injects its resolved ports at runtime; this context cast
    // keeps the legacy port surface from leaking into route handlers.
    ports: services.ports as unknown as AdaptiveExecutionContext["ports"],
  };
}

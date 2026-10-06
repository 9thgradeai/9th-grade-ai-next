import { NextResponse } from "next/server";
import { log } from "~backend/infrastructure/observability/logger";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code: string = "INTERNAL_ERROR",
    isOperational: boolean = true,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Validation failed") {
    super(400, message, "VALIDATION_ERROR");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(404, message, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "Conflict") {
    super(409, message, "CONFLICT");
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = "Too many requests") {
    super(429, message, "RATE_LIMIT_EXCEEDED");
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = "Internal server error", options?: { cause?: unknown }) {
    super(500, message, "INTERNAL_ERROR", false, options);
  }
}

/** Environment/deployment misconfiguration (missing dep, bad URL…). */
export class ConfigurationError extends AppError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(500, message, "CONFIGURATION_ERROR", false, options);
  }
}

export function toHttpResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    // Non-operational errors (500s) are logged server-side WITH their cause
    // chain so on-call has query context; the client only ever sees the safe
    // generic message. `development` alone gets internals — staging uses
    // production-like data and must not leak Prisma/DB messages or stacks.
  if (!error.isOperational) {
    log.error("http.unexpected", { code: error.code, message: error.message, stack: error.cause ?? error.stack });
  }
    const isDev = process.env.NODE_ENV === "development";
    const payload: Record<string, unknown> = {
      // Operational errors (4xx, expected failures) carry safe messages.
      // Non-operational 500s expose internals only in local development.
      error: error.isOperational || isDev ? error.message : "An unexpected error occurred.",
      code: error.code,
    };

    if (isDev && !error.isOperational) {
      payload.stack = error.stack;
    }

    return NextResponse.json(payload, { status: error.statusCode });
  }

  if (error instanceof Error) {
    // Unexpected (non-operational) errors: log the real cause server-side, but
    // never return internals like Prisma/DB messages to the client except in
    // local development.
    log.error("http.unhandled", { message: error.message, stack: error.stack });
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === "development"
            ? error.message
            : "An unexpected error occurred.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "An unexpected error occurred.", code: "UNKNOWN_ERROR" },
    { status: 500 },
  );
}

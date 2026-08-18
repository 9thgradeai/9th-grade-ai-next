import { NextResponse } from "next/server";

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code: string = "INTERNAL_ERROR",
    isOperational: boolean = true,
  ) {
    super(message);
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
  constructor(message: string = "Internal server error") {
    super(500, message, "INTERNAL_ERROR", false);
  }
}

export function toHttpResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const payload: Record<string, unknown> = {
      error: error.message,
      code: error.code,
    };

    if (process.env.NODE_ENV !== "production" && !error.isOperational) {
      payload.stack = error.stack;
    }

    return NextResponse.json(payload, { status: error.statusCode });
  }

  if (error instanceof Error) {
    return NextResponse.json(
      { error: error.message, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "An unexpected error occurred.", code: "UNKNOWN_ERROR" },
    { status: 500 },
  );
}

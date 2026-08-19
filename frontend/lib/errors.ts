export class AppError extends Error {
  message: string;
  code: string;
  status: number;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500) {
    super(message);
    this.message = message;
    this.code = code;
    this.status = status;
    this.name = "AppError";
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function isApiError(value: unknown): value is { message: string; code: string; status: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).message === "string" &&
    typeof (value as Record<string, unknown>).code === "string" &&
    typeof (value as Record<string, unknown>).status === "number"
  );
}

export function handleApiError(error: unknown): AppError {
  if (isAppError(error)) return error;

  if (isApiError(error)) {
    return new AppError(error.message, error.code, error.status);
  }

  if (typeof error === "string") {
    return new AppError(error, "UNKNOWN_ERROR", 500);
  }

  if (error instanceof Error) {
    return new AppError(error.message, "UNKNOWN_ERROR", 500);
  }

  return new AppError("An unexpected error occurred.", "UNKNOWN_ERROR", 500);
}

export function getUserFriendlyMessage(error: AppError): string {
  const codeMessages: Record<string, string> = {
    NETWORK_ERROR: "Network connection failed. Please check your internet.",
    TIMEOUT: "Request timed out. Please try again.",
    UNAUTHORIZED: "Your session has expired. Please log in again.",
    FORBIDDEN: "You do not have permission to perform this action.",
    NOT_FOUND: "The requested resource was not found.",
    VALIDATION_ERROR: "Please check your input and try again.",
    SERVER_ERROR: "Server error. Please try again later.",
    UNKNOWN_ERROR: "Something went wrong. Please try again.",
    AUTH_INVALID_CREDENTIALS: "Invalid email or password.",
    USER_EMAIL_EXISTS:
      "An account with that email already exists. Try logging in instead.",
    RATE_LIMIT_EXCEEDED: "Too many attempts. Please wait a moment and try again.",
  };

  return codeMessages[error.code] ?? error.message;
}

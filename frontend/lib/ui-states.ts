/**
 * Shared vocabulary for the "something went wrong" surfaces.
 *
 * One error code per failure class the app actually distinguishes, each with
 * the copy a user should read and whether trying again can help. Components
 * (`ErrorState`, dashboard tabs, route error pages) read from this map instead
 * of inventing their own wording per call site.
 */

export type ApiErrorCode =
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "AUTH_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMIT"
  | "SERVER_ERROR";

export interface ApiErrorInfo {
  code: ApiErrorCode;
  /** Short statement of what happened. */
  message: string;
  /** What the user can do about it. */
  userMessage: string;
  /** Label for the recovery action, when there is one. */
  action?: string;
  /** True when retrying the same request could plausibly succeed. */
  retryable: boolean;
}

export const API_ERRORS: Record<ApiErrorCode, ApiErrorInfo> = {
  TIMEOUT: {
    code: "TIMEOUT",
    message: "That took too long",
    userMessage: "The server didn't answer in time. Your connection may be slow, or the service is busy.",
    action: "Try again",
    retryable: true,
  },
  NETWORK_ERROR: {
    code: "NETWORK_ERROR",
    message: "Can't reach the server",
    userMessage: "You look offline, or the connection dropped. Check your network and try again.",
    action: "Try again",
    retryable: true,
  },
  VALIDATION_ERROR: {
    code: "VALIDATION_ERROR",
    message: "Some details need fixing",
    userMessage: "Check the highlighted fields and submit again.",
    retryable: false,
  },
  AUTH_ERROR: {
    code: "AUTH_ERROR",
    message: "Please sign in again",
    userMessage: "Your session ended. Signing in will bring you back to where you were.",
    action: "Sign in",
    retryable: false,
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    message: "Not found",
    userMessage: "This may have been moved or removed. Head back to a page you know works.",
    action: "Go to dashboard",
    retryable: false,
  },
  CONFLICT: {
    code: "CONFLICT",
    message: "That changed while you were working",
    userMessage: "Someone or something else updated this first. Refresh to see the current version.",
    action: "Refresh",
    retryable: true,
  },
  RATE_LIMIT: {
    code: "RATE_LIMIT",
    message: "Too many requests",
    userMessage: "You're going faster than we can answer. Wait a few seconds and try again.",
    action: "Wait and retry",
    retryable: true,
  },
  SERVER_ERROR: {
    code: "SERVER_ERROR",
    message: "Something broke on our end",
    userMessage: "This isn't something you did. Try again — if it keeps happening, it's worth telling us.",
    action: "Try again",
    retryable: true,
  },
};

/**
 * Map a transport-level failure onto the closest user-facing class.
 * `ApiError.code` from `frontend/lib/services/api.ts` already carries one of
 * these names when the server supplied it.
 */
export function classifyError(error: unknown): ApiErrorCode {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code in API_ERRORS) {
      return code as ApiErrorCode;
    }
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") {
      if (status === 401 || status === 403) return "AUTH_ERROR";
      if (status === 404) return "NOT_FOUND";
      if (status === 409) return "CONFLICT";
      if (status === 429) return "RATE_LIMIT";
      if (status === 408) return "TIMEOUT";
      if (status >= 500) return "SERVER_ERROR";
    }
  }
  if (error instanceof TypeError) return "NETWORK_ERROR";
  return "SERVER_ERROR";
}

// The network-status hook needs React; it lives in its own module so this one
// stays a pure data module that server code can import safely.
export { useNetworkStatus } from "./ui-states-network";
export type { NetworkStatus } from "./ui-states-network";

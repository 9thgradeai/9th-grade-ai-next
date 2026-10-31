"use client";

import type { ReactNode } from "react";
import { API_ERRORS, type ApiErrorCode } from "@/lib/ui-states";

/**
 * ErrorState — says what went wrong and how to fix it.
 *
 * Standalone presentation component: no data fetching, no side effects, so it
 * is safe as an error-boundary fallback, a route error page, or an inline
 * panel inside a tab. Callers own the retry semantics.
 */
export default function ErrorState({
  code = "SERVER_ERROR",
  title,
  message,
  action,
  onRetry,
  retryable,
  className = "",
}: {
  code?: ApiErrorCode;
  title?: string;
  message?: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryable?: boolean;
  className?: string;
}) {
  const info = API_ERRORS[code];
  const heading = title ?? info.message;
  const body = message ?? info.userMessage;
  const canRetry = retryable ?? info.retryable;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--dashboard-danger)]/30 bg-[var(--dashboard-danger-subtle)]">
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          style={{ color: "var(--dashboard-danger)" }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </span>

      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {heading}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {body}
      </p>

      {(canRetry && onRetry) || action ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {canRetry && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg px-4 py-2 font-mono text-xs transition-colors"
              style={{
                background: "var(--accent)",
                color: "var(--dashboard-text-inverse)",
              }}
            >
              {info.action ?? "Try again"}
            </button>
          )}
          {action}
        </div>
      ) : null}

      {code === "NETWORK_ERROR" && (
        <p className="mt-4 max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Check your connection, then retry. Still failing?{" "}
          <a
            href="https://status.9thgrade.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            Service status
          </a>
        </p>
      )}

      {code === "AUTH_ERROR" && (
        <p className="mt-4 max-w-sm text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Your session may have expired.{" "}
          <a href="/login" className="underline" style={{ color: "var(--accent)" }}>
            Sign in again
          </a>{" "}
          to continue.
        </p>
      )}
    </div>
  );
}

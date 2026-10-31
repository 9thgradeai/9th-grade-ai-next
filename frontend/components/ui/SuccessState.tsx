"use client";

import type { ReactNode } from "react";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";

/**
 * SuccessState — confirm the action landed, then say what happens next.
 *
 * No injected confetti, no auto-toast: the caller decides whether this is a
 * full panel or inline, and whether it announces itself. A success panel that
 * renders on every mount and fires its own toast is a double-announcement bug.
 */
export default function SuccessState({
  title,
  message,
  action,
  nextAction,
  announce = true,
  className = "",
}: {
  title: string;
  message?: string;
  /** Secondary content, e.g. a receipt line or summary. */
  action?: ReactNode;
  /** The single obvious next step. */
  nextAction?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /** Set false when the surrounding region already announces the result. */
  announce?: boolean;
  className?: string;
}) {
  return (
    <div
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--accent)]/30 bg-[var(--dashboard-primary-subtle)]">
        <CheckCircle
          aria-hidden="true"
          weight="fill"
          className="h-6 w-6"
          style={{ color: "var(--accent)" }}
        />
      </span>

      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      {message && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {message}
        </p>
      )}

      {action && <div className="mt-4 w-full max-w-sm">{action}</div>}

      {nextAction && (
        <button
          type="button"
          onClick={nextAction.onClick}
          disabled={nextAction.disabled}
          className="mt-4 flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--dashboard-text-inverse)" }}
        >
          {nextAction.label}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

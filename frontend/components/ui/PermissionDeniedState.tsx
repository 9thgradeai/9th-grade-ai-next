"use client";

import { ArrowLeft, House, Info, Lock } from "@phosphor-icons/react";
import Link from "next/link";

/**
 * PermissionDeniedState — the user is signed in (or signed out) but not
 * allowed here. Explains why in plain language and always leaves a way back.
 *
 * Distinct from ErrorState/AUTH_ERROR: that is "we don't know who you are";
 * this is "we do, and it isn't enough".
 */
export default function PermissionDeniedState({
  reason,
  title = "You don't have access to this",
  onBack,
  onLearnMore,
  backLabel = "Go back",
  className = "",
}: {
  /** Why access was refused, in the user's terms (not an error code). */
  reason: string;
  title?: string;
  onBack?: () => void;
  /** Optional: link to the access/roles explanation. */
  onLearnMore?: () => void;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
        <Lock aria-hidden="true" className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
      </span>

      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {reason}
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-raised)] px-4 py-2 font-mono text-xs transition-colors hover:text-[var(--text-primary)]"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            {backLabel}
          </button>
        ) : (
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs"
            style={{ background: "var(--accent)", color: "var(--dashboard-text-inverse)" }}
          >
            <House aria-hidden="true" className="h-3.5 w-3.5" />
            Back to dashboard
          </Link>
        )}

        {onLearnMore && (
          <button
            type="button"
            onClick={onLearnMore}
            className="flex items-center gap-1.5 text-[11px] underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            <Info aria-hidden="true" className="h-3.5 w-3.5" />
            Why am I seeing this?
          </button>
        )}
      </div>
    </div>
  );
}

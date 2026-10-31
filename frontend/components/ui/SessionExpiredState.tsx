"use client";

import { useState } from "react";
import { ClockCounterClockwise, FloppyDisk, SignOut, WarningCircle } from "@phosphor-icons/react";

/**
 * SessionExpiredState — the session timed out. Save the user's work before
 * signing them out.
 *
 * Honest by construction: nothing is claimed to be saved unless the caller's
 * `onSaveAndContinue` handler resolves. If there is unsaved work and no save
 * handler, the UI says it will be lost rather than pretending otherwise.
 */
export default function SessionExpiredState({
  unsavedWork = false,
  title = "Session expired",
  message,
  onSaveAndContinue,
  onDiscardAndSignOut,
  onSignIn,
  className = "",
}: {
  unsavedWork?: boolean;
  title?: string;
  message?: string;
  /** Persist pending work, then send the user to sign in again. */
  onSaveAndContinue?: () => void | Promise<void>;
  /** Throw away pending work and sign out. */
  onDiscardAndSignOut?: () => void;
  /** No unsaved work: go straight to sign-in. */
  onSignIn?: () => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<"idle" | "saving" | "failed">("idle");

  const body =
    message ??
    (unsavedWork
      ? onSaveAndContinue
        ? "You have unsaved work. Save it before signing in again."
        : "You have unsaved work. Signing in again will discard it."
      : "Your session timed out. Sign in again to continue where you left off.");

  const handleSave = async () => {
    if (!onSaveAndContinue) return;
    setPhase("saving");
    try {
      await onSaveAndContinue();
    } catch {
      setPhase("failed");
    }
  };

  return (
    <div
      role="alertdialog"
      aria-labelledby="session-expired-title"
      aria-describedby="session-expired-body"
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--dashboard-warning)]/30 bg-[var(--dashboard-warning-subtle)]">
        <ClockCounterClockwise
          aria-hidden="true"
          className="h-5 w-5"
          style={{ color: "var(--dashboard-warning)" }}
        />
      </span>

      <h2 id="session-expired-title" className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p id="session-expired-body" className="mt-1 max-w-sm text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {body}
      </p>

      {phase === "failed" && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px]" style={{ color: "var(--dashboard-danger)" }}>
          <WarningCircle aria-hidden="true" className="h-3.5 w-3.5" />
          Couldn&apos;t save your work. Try again, or sign out to discard it.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {unsavedWork && onSaveAndContinue && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={phase === "saving"}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs transition-opacity disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--dashboard-text-inverse)" }}
          >
            <FloppyDisk aria-hidden="true" className="h-3.5 w-3.5" />
            {phase === "saving" ? "Saving…" : phase === "failed" ? "Retry save" : "Save and sign in"}
          </button>
        )}

        <button
          type="button"
          onClick={onSignIn}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-raised)] px-4 py-2 font-mono text-xs transition-colors hover:text-[var(--text-primary)]"
          style={{ color: "var(--text-muted)" }}
        >
          <SignOut aria-hidden="true" className="h-3.5 w-3.5" />
          {unsavedWork ? "Discard and sign out" : "Sign in again"}
        </button>

        {unsavedWork && onSaveAndContinue && onDiscardAndSignOut && (
          <button
            type="button"
            onClick={onDiscardAndSignOut}
            className="text-[11px] underline underline-offset-2"
            style={{ color: "var(--text-muted)" }}
          >
            Discard unsaved work
          </button>
        )}
      </div>
    </div>
  );
}

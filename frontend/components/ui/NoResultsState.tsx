"use client";

import { ArrowCounterClockwise, Funnel, MagnifyingGlass } from "@phosphor-icons/react";

/**
 * NoResultsState — a search or filter combination returned nothing.
 *
 * The point is to suggest a next move rather than dead-end on "0 results":
 * echo what was searched, offer one-tap alternative queries, and let the user
 * clear filters or retry the search.
 */
export default function NoResultsState({
  query,
  scope,
  suggestions = [],
  onPickSuggestion,
  onReset,
  onSearchAgain,
  className = "",
}: {
  /** What the user searched for. Rendered verbatim. */
  query: string;
  /** Where the search ran, e.g. "question bank". */
  scope?: string;
  /** Alternative queries to offer as one-tap chips. */
  suggestions?: string[];
  onPickSuggestion?: (query: string) => void;
  /** Clear filters / search term. */
  onReset?: () => void;
  /** Re-run the same search (e.g. after a transient failure). */
  onSearchAgain?: () => void;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--surface-muted)]">
        <MagnifyingGlass
          aria-hidden="true"
          className="h-5 w-5"
          style={{ color: "var(--text-muted)" }}
        />
      </span>

      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        No results for &ldquo;{query}&rdquo;
      </p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {scope
          ? `Nothing in the ${scope} matched that. Try a shorter or differently spelled term.`
          : "Nothing matched that. Try a shorter or differently spelled term."}
      </p>

      {suggestions.length > 0 && (
        <div className="mt-4 flex max-w-sm flex-wrap items-center justify-center gap-1.5">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPickSuggestion?.(suggestion)}
              className="rounded-full border border-[var(--dashboard-border-muted)] px-3 py-1 font-mono text-[11px] transition-colors hover:border-[var(--accent)]"
              style={{ color: "var(--text-muted)" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {(onReset || onSearchAgain) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onSearchAgain && (
            <button
              type="button"
              onClick={onSearchAgain}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 font-mono text-xs transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)", color: "var(--dashboard-text-inverse)" }}
            >
              <ArrowCounterClockwise aria-hidden="true" className="h-3.5 w-3.5" />
              Search again
            </button>
          )}
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--surface-raised)] px-4 py-2 font-mono text-xs transition-colors hover:text-[var(--text-primary)]"
              style={{ color: "var(--text-muted)" }}
            >
              <Funnel aria-hidden="true" className="h-3.5 w-3.5" />
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}

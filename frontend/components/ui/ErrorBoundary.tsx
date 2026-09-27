"use client";

import { Component, ReactNode } from "react";
import { captureException } from "@sentry/nextjs";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Remount (clear the error) when any key changes — e.g. activeTab. */
  resetKeys?: unknown[];
  /** Runs on retry (after the error clears) — use to refetch, otherwise the
   * retry re-renders the same crashed tree against the same stale cache. */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function keysChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (prev === next) return false;
  if (!prev || !next || prev.length !== next.length) return true;
  return prev.some((k, i) => !Object.is(k, next[i]));
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // Client crashes previously vanished into console.error — forward to
    // Sentry so tab crashes are actually visible on-call.
    try {
      captureException(error, {
        contexts: { react: { componentStack: info.componentStack } },
      });
    } catch {
      // Reporting must never break the fallback UI.
    }
    // eslint-disable-next-line no-restricted-globals -- NODE_ENV inlined by Next.js at build time
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && keysChanged(prevProps.resetKeys, this.props.resetKeys)) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-red-500/20 bg-[var(--dashboard-danger-subtle)]">
          <p className="text-[var(--dashboard-danger)] font-mono text-sm mb-2">Something went wrong</p>
          <p className="text-[var(--dashboard-text-muted)] text-xs mb-4 font-mono">{this.state.error.message}</p>
          <button
            onClick={this.reset}
            className="px-4 py-2 bg-[var(--dashboard-danger-subtle)] border border-red-500/30 rounded-2xl text-[var(--dashboard-danger)] font-mono text-sm hover:bg-[var(--dashboard-danger-subtle)] transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

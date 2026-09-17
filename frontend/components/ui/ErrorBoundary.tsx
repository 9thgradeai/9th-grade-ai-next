"use client";

import { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
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

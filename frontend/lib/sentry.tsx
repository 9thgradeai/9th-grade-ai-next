"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProduction = Boolean(dsn && typeof window !== "undefined" && window.location.hostname !== "localhost");

// Client Sentry is deliberately minimal: ERROR monitoring + context only.
// Replay (@sentry/replay, ~121 KB) and browser tracing/metrics
// (browserTracingIntegration, ~25-35 KB) were removed because they ran in the
// eager preload set on EVERY page via the root layout (see
// docs/PERFORMANCE-OPTIMIZATION.md §5). Server-side HTTP tracing is unaffected
// (see instrumentation.ts). Re-enable per-product decision if replay/tracing
// observability outweighs the per-page bundle cost.
Sentry.init({
  dsn,
  debug: !isProduction,
  enabled: isProduction,
  beforeSend(event) {
    if (!isProduction) {
      return null;
    }
    return event;
  },
});

export function SentryClientProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Ensure Sentry is initialized on client side
    Sentry.setContext("app", { name: "9th-grade-ai" });
  }, []);

  return <>{children}</>;
}

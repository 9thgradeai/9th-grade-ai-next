"use client";

import { useEffect } from "react";

// eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// Client Sentry is deliberately minimal: ERROR monitoring + context only.
// Replay (@sentry/replay, ~121 KB) and browser tracing/metrics
// (browserTracingIntegration, ~25-35 KB) were removed because they ran in the
// eager preload set on EVERY page via the root layout (see
// docs/PERFORMANCE-OPTIMIZATION.md §5). Server-side HTTP tracing is unaffected
// (see instrumentation.ts). Re-enable per-product decision if replay/tracing
// observability outweighs the per-page bundle cost.
//
// Sprint 10: the SDK import itself (~50 KB unused on landing per Lighthouse)
// is now dynamic + idle-deferred, so it leaves the initial chunk entirely.
// Tradeoff, stated plainly: errors thrown in the first seconds on very slow
// devices go unsampled. Error monitoring still covers all steady-state use.
function initSentryIdle() {
  const init = () => {
    import("@sentry/nextjs")
      .then((Sentry) => {
        const isProduction = Boolean(
          dsn && typeof window !== "undefined" && window.location.hostname !== "localhost",
        );
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
        Sentry.setContext("app", { name: "9th-grade-ai" });
      })
      .catch(() => {
        // Monitoring must never break the app.
      });
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(init, { timeout: 5000 });
  } else {
    setTimeout(init, 3000);
  }
}

export function SentryClientProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentryIdle();
  }, []);

  return <>{children}</>;
}

// Server startup hook (Next.js `instrumentation.ts` file convention — the
// `register` function runs exactly once per server instance, before the
// instance serves requests; see node_modules/next/dist/docs/01-app/…).
//
// Two responsibilities, both nodejs-only:
//   1. Register domain-event subscribers (badges, learning events,
//      notifications) exactly once per process — `backend/events/subscribers.ts`
//      is idempotent under dev HMR via its globalThis guard.
//   2. Log first-release configuration warnings (email transport / AI keys /
//      REDIS_URL) so a degraded production config is visible in the logs
//      instead of silent — `backend/lib/startup-checks.ts`.

import * as Sentry from "@sentry/nextjs";

// Server-side error reporting + HTTP tracing (ADR-0013 explicitly keeps the
// server trace: it adds zero client-bundle cost). Client-side Sentry is
// error-monitoring only — see frontend/lib/sentry.tsx.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 0.1,
  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: process.env.NODE_ENV !== "production",
  // Only send events in production
  enabled: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
});

export async function register() {
  // `backend/` modules are server-only; the hook is also invoked for the edge
  // runtime, so guard before importing them.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerSubscribers } = await import("~backend/events/subscribers");
  registerSubscribers();

  const { logStartupWarnings } = await import("~backend/lib/startup-checks");
  logStartupWarnings();
}

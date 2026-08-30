"use client";

import * as Sentry from "@sentry/nextjs";
import { replayIntegration, browserTracingIntegration } from "@sentry/react";
import { useEffect } from "react";

// eslint-disable-next-line no-restricted-globals -- NEXT_PUBLIC_* inlined by Next.js at build time
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const isProduction = Boolean(dsn && typeof window !== "undefined" && window.location.hostname !== "localhost");

Sentry.init({
  dsn,
  tracesSampleRate: 0.1,
  debug: !isProduction,
  enabled: isProduction,
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    browserTracingIntegration(),
  ],
  beforeSend(event) {
    if (!isProduction) {
      return null;
    }
    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

export function SentryClientProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Ensure Sentry is initialized on client side
    Sentry.setContext("app", { name: "9th-grade-ai" });
  }, []);

  return <>{children}</>;
}

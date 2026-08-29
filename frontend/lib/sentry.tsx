"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// eslint-disable-next-line no-restricted-globals -- process.env is inlined by Next.js at build time
const env = process.env;

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // eslint-disable-next-line no-restricted-globals
  debug: env.NODE_ENV !== "production",
  // eslint-disable-next-line no-restricted-globals
  enabled: env.NODE_ENV === "production" || env.VERCEL_ENV === "production",
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],
  beforeSend(event) {
    // eslint-disable-next-line no-restricted-globals
    if (env.NODE_ENV !== "production" && env.VERCEL_ENV !== "production") {
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

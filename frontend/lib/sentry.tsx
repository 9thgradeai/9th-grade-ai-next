"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: process.env.NODE_ENV !== "production",
  enabled: process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production",
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
    if (process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production") {
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
// backend/schedule.ts — schedule work that must outlive the response.
//
// On serverless (Vercel), an invocation can be frozen the moment the response
// finishes; bare `void promise` background writes (chat history, usage ledger,
// badge awards) are silently dropped. Next.js exposes the platform's
// waitUntil primitive via its request context — this helper routes through it
// when present and falls back to plain fire-and-forget on long-lived Node
// servers (where promises keep running anyway) and in tests.

import "server-only";

type RequestContextHolder = {
  get?: () => { waitUntil?: (promise: Promise<unknown>) => void } | undefined;
};

export function runAfterResponse(work: () => Promise<void>): void {
  const holder = (globalThis as Record<symbol, unknown>)[
    Symbol.for("@next/request-context")
  ] as RequestContextHolder | undefined;
  const waitUntil = holder?.get?.()?.waitUntil;

  if (waitUntil) {
    waitUntil(work().catch((err) => {
      console.error(
        "[schedule] post-response work failed:",
        err instanceof Error ? err.message : err,
      );
    }));
    return;
  }

  work().catch((err) => {
    console.error(
      "[schedule] post-response work failed:",
      err instanceof Error ? err.message : err,
    );
  });
}

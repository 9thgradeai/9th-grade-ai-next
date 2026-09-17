"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full glass rounded-2xl border border-red-500/30 p-6 md:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-mono font-bold text-lg">
              ✕
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">System Failure</h2>
              <p className="text-xs text-zinc-400 font-mono">FATAL_ERROR // 0x4F2A</p>
            </div>
          </div>
          <p className="text-sm text-zinc-300 mb-6">
            The application encountered an unexpected error. The development team has been notified.
          </p>
          <div className="flex gap-3">
            <button
              onClick={retry}
              className="flex-1 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors"
            >
              RETRY_SYSTEM
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

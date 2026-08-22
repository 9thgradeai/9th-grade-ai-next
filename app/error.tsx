"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Page error:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full glass rounded-terminal-rounded border border-red-500/30 p-6 md:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-mono font-bold text-lg">
            ✕
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
            <p className="text-xs text-zinc-400 font-mono">ERROR // {error.digest ?? "0x4F2A"}</p>
          </div>
        </div>
        <p className="text-sm text-zinc-300 mb-6">
          This page failed to render. You can retry, or head back to the homepage.
        </p>
        <div className="flex gap-3">
          <button
            onClick={retry}
            className="flex-1 px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors"
          >
            RETRY
          </button>
          <Link
            href="/"
            className="flex-1 px-4 py-2 border border-zinc-700 text-zinc-300 font-mono text-sm rounded hover:bg-zinc-800 transition-colors text-center"
          >
            GO_HOME
          </Link>
        </div>
      </div>
    </div>
  );
}

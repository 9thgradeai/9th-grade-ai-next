"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
      <div className="max-w-md w-full glass rounded-terminal-rounded border border-red-500/30 p-6 text-center">
        <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 font-mono font-bold text-xl mx-auto mb-4">
          !
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Dashboard Malfunction</h2>
        <p className="text-sm text-zinc-400 mb-6 font-mono">
          A subsystem failed to load. Retrying may resolve the issue.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={retry}
            className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors"
          >
            RETRY
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 border border-zinc-700 text-zinc-300 font-mono text-sm rounded hover:bg-zinc-800 transition-colors"
          >
            RELOAD_DASHBOARD
          </button>
        </div>
      </div>
    </div>
  );
}

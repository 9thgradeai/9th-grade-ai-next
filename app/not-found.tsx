"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full glass rounded-2xl border border-terminal-border p-8 text-center">
        <div className="text-6xl font-mono font-bold text-emerald-500/20 mb-4">404</div>
        <h2 className="text-xl font-semibold text-white mb-2">Sector Not Found</h2>
        <p className="text-sm text-zinc-400 mb-6 font-mono">
          The requested resource does not exist in the current filesystem.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-emerald-500 text-zinc-950 font-mono text-sm rounded hover:bg-emerald-400 transition-colors"
          >
            RETURN_TO_BASE
          </Link>
          <GoBackButton />
        </div>
      </div>
    </div>
  );
}

function GoBackButton() {
  const router = useRouter();
  const [clicked, setClicked] = useState(false);

  return (
    <button
      onClick={() => {
        setClicked(true);
        router.back();
      }}
      disabled={clicked}
      className="px-4 py-2 border border-zinc-700 text-zinc-300 font-mono text-sm rounded hover:bg-zinc-800 transition-colors disabled:opacity-50"
    >
      GO_BACK
    </button>
  );
}

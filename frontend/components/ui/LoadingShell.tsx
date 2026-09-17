"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* ── Compact inline loading panel — 9G circle + slim progress.
     Used at route boundaries (app/loading.tsx, app/dashboard/loading.tsx),
     dashboard auth gate, and lazy tab chunk fallback. */

export function LoadingShell({
  title = "LOADING",
  progressLabel = "loading",
  className = "",
}: {
  title?: string;
  progressLabel?: string;
  className?: string;
}) {
  const [progress, setProgress] = useState(18);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(90, 18 + (elapsed / 1800) * 72));
    }, 40);
    return () => clearInterval(tick);
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0f] ${className}`}
      role="status"
      aria-label={title}
      aria-live="polite"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(45,212,191,0.14),transparent_60%),radial-gradient(ellipse_50%_40%_at_90%_80%,rgba(167,139,250,0.12),transparent_55%)]" />

      <div className="relative flex flex-col items-center gap-4 px-6 py-8 text-center">
        <p className="font-mono text-[10px] tracking-[0.32em] text-emerald-400/80">{title}</p>

        <div className="relative flex h-[84px] w-[84px] items-center justify-center">
          <motion.div
            aria-hidden="true"
            className="absolute inset-0 rounded-full border border-emerald-400/20"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(45,212,191,0.55) 42deg, rgba(167,139,250,0.45) 160deg, transparent 240deg)",
              mask: "radial-gradient(circle, transparent 62%, black 63%)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            aria-hidden="true"
            className="absolute inset-[18%] rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-violet-400 blur-[0.5px]"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-[22%] rounded-full bg-[#0a0a0f] shadow-[0_0_22px_rgba(45,212,191,0.5)]" />
          <span className="relative font-display text-[22px] font-bold text-white">9G</span>
        </div>

        <div className="w-full max-w-[220px]" role="progressbar" aria-label={progressLabel} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            <span>{progressLabel}</span>
            <span className="tabular-nums text-emerald-400">{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400"
              animate={{ width: `${progress}%` }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.2 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

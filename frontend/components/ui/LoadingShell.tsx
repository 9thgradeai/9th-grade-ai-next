"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/* ── Addictive inline loading panel — replaces the previous AuroraRing-only shell
    Used at route boundaries (app/loading.tsx, app/dashboard/loading.tsx),
    dashboard auth gate, and lazy tab chunk fallback. Visually unified with
    GlobalBootLoader (same dual-ring + terminal) but rendered inline, not fixed. */

const DEFAULT_STEPS = [
  "INITIALIZING MODULES",
  "SYNCING PROGRESS",
  "LOADING QUESTIONS",
  "CALIBRATING ACCURACY",
];

export function LoadingShell({
  title = "LOADING_DASHBOARD",
  messages = DEFAULT_STEPS,
  progressLabel = "dashboard boot",
  className = "",
}: {
  title?: string;
  messages?: string[];
  progressLabel?: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(18);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(92, 18 + (elapsed / 1800) * 82));
    }, 40);
    let idx = 0;
    const adv = () => {
      if (idx < messages.length - 1) {
        idx += 1;
        setStep(idx);
        setTimeout(adv, 420);
      } else {
        setProgress(100);
      }
    };
    const t0 = setTimeout(adv, 420);
    return () => {
      clearInterval(tick);
      clearTimeout(t0);
    };
  }, [messages]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0f] ${className}`}
      role="status"
      aria-label={title}
      aria-live="polite"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:28px_28px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,black_60%,transparent_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(45,212,191,0.14),transparent_60%),radial-gradient(ellipse_50%_40%_at_90%_80%,rgba(167,139,250,0.12),transparent_55%)]" />

      <div className="relative flex flex-col items-center gap-5 px-6 py-8 text-center">
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

        <div className="w-full max-w-[420px] space-y-2 text-left">
          {messages.map((m, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div key={m} className="flex items-center gap-2 font-mono text-xs">
                <span
                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${done ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400" : active ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-zinc-600"}`}
                >
                  {done ? "✓" : active ? "›" : "·"}
                </span>
                <span className={`${done ? "text-zinc-500" : active ? "text-white" : "text-zinc-600"}`}>
                  <span className="text-emerald-400/70">$</span> {m}
                </span>
              </div>
            );
          })}
        </div>

        <div className="w-full max-w-[420px]" role="progressbar" aria-label={progressLabel} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-zinc-500">
            <span>{progressLabel}</span>
            <span className="tabular-nums text-emerald-400">{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400"
              animate={{ width: `${progress}%` }}
              transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.2 }}
            />
          </div>
        </div>
      </div>

      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 border-l-2 border-t-2 border-emerald-400/20" />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 h-4 w-4 border-r-2 border-t-2 border-emerald-400/20" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 border-b-2 border-l-2 border-emerald-400/20" />
      <span aria-hidden="true" className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 border-b-2 border-r-2 border-emerald-400/20" />
    </div>
  );
}

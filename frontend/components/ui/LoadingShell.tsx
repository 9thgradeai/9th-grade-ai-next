"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNetworkStatus } from "@/lib/ui-states";

/* ── Compact inline loading panel, 9G circle + slim progress.
     Used at route boundaries (app/loading.tsx, app/dashboard/loading.tsx),
     dashboard auth gate, and lazy tab chunk fallback.

     On a slow connection the ring is dimmed and the elapsed-time percentage
     becomes the primary signal, so the wait never reads as a frozen spinner.
     When the browser reports no connectivity we say so instead of spinning. */

export function LoadingShell({
  title = "LOADING",
  progressLabel = "loading",
  className = "",
  showProgress = true,
}: {
  title?: string;
  progressLabel?: string;
  className?: string;
  showProgress?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  const networkStatus = useNetworkStatus();
  const slow = networkStatus === "slow";
  const offline = networkStatus === "offline";

  // These screens are genuinely indeterminate (auth check, redirect, lazy
  // chunk) — there is no real progress to report. A percentage that creeps
  // toward 90% and then freezes reads as a broken app, so we report elapsed
  // time instead, which is both honest and still shows that work is ongoing.
  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, []);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#12100e] ${className}`}
      role="status"
      aria-label={title}
      aria-live="polite"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(255,106,61,0.14),transparent_60%),radial-gradient(ellipse_50%_40%_at_90%_80%,rgba(240,201,135,0.12),transparent_55%)]"
      />

      <div className="relative flex flex-col items-center gap-4 px-6 py-8 text-center">
        <p className="font-mono text-[11px] tracking-[0.32em] text-[#ff8a5c]/80">
          {title} {offline && <span className="text-[#918a80]">(offline)</span>}
        </p>

        {offline ? (
          <p className="max-w-[260px] text-xs leading-relaxed text-[#a9a29a]">
            No connection. We&apos;ll keep this screen open — reconnect and it will
            pick up where it left off.
          </p>
        ) : showProgress ? (
          <>
            <div
              className={`relative flex h-[84px] w-[84px] items-center justify-center ${
                slow ? "opacity-60" : ""
              }`}
            >
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-[#ff6a3d]/20"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, rgba(255,106,61,0.55) 42deg, rgba(240,201,135,0.45) 160deg, transparent 240deg)",
                  mask: "radial-gradient(circle, transparent 62%, black 63%)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
              />
              <motion.div
                aria-hidden="true"
                className="absolute inset-[18%] rounded-full bg-gradient-to-br from-[#ff6a3d] via-[#f0c987] to-[#ff8259] blur-[0.5px]"
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="absolute inset-[22%] rounded-full bg-[#12100e] shadow-[0_0_22px_rgba(255,106,61,0.5)]" />
              <span className="relative font-display text-[22px] font-bold text-white">9G</span>
            </div>

            {/* The ticking counter must not re-announce every second — the
                surrounding role="status" announces the title once. */}
            <div className="w-full max-w-[220px]" aria-live="off">
              <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.18em] text-[#918a80]">
                <span>{slow ? "slow connection" : progressLabel}</span>
                <span className="tabular-nums text-[#ff8a5c]/80">{elapsed}s</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#ff6a3d] via-[#f0c987] to-[#ff8259]"
                  animate={{ x: ["-100%", "300%"] }}
                  transition={{ ease: "easeInOut", duration: 1.4, repeat: Infinity }}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-[84px] w-[84px] items-center justify-center">
            <motion.div
              aria-hidden="true"
              className="absolute h-[84px] w-[84px] rounded-full border border-[#ff6a3d]/20"
              animate={{ rotate: 360 }}
              transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
            />
            <span className="relative text-2xl text-[#ff8a5c]">9G</span>
          </div>
        )}
      </div>
    </div>
  );
}

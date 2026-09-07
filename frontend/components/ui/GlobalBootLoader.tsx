"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = [
  { label: "INITIALIZING NEURAL ENGINE", ms: 320 },
  { label: "SYNCING QUESTION BANK — 12,847 NODES", ms: 420 },
  { label: "CALIBRATING ACCURACY MODEL", ms: 380 },
  { label: "HYDRATING PROGRESS — STREAK • MASTERY • MISTAKES", ms: 360 },
  { label: "SYSTEM READY — WELCOME ASPIRANT", ms: 280 },
];

const MIN_SHOW_MS = 2200;
const MAX_SHOW_MS = 3800;

export default function GlobalBootLoader() {
  const [visible, setVisible] = useState(true);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(0);
  const allowedToDismissRef = useRef(false);

  // every hard navigation shows boot — no sessionStorage skip
  useEffect(() => {
    startRef.current = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      // progress eased to 100 by MIN_SHOW_MS, then hold at 100 until dismiss
      const p = Math.min(100, (elapsed / MIN_SHOW_MS) * 100);
      setProgress(p);
      if (elapsed > 800) allowedToDismissRef.current = true;
    }, 32);

    // sequential steps
    let idx = 0;
    const advance = () => {
      if (idx < STEPS.length - 1) {
        idx += 1;
        setStep(idx);
        setTimeout(advance, STEPS[idx].ms);
      }
    };
    const t0 = setTimeout(advance, STEPS[0].ms);

    // auto dismiss after MIN_SHOW or when window load + min
    const maybeDismiss = () => {
      const elapsed = Date.now() - startRef.current;
      if (elapsed >= MIN_SHOW_MS) setVisible(false);
      else setTimeout(maybeDismiss, MIN_SHOW_MS - elapsed + 60);
    };
    const auto = setTimeout(maybeDismiss, MIN_SHOW_MS + 200);

    // safety hard cap
    const hard = setTimeout(() => setVisible(false), MAX_SHOW_MS);

    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key === " ") && allowedToDismissRef.current) setVisible(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      clearInterval(tick);
      clearTimeout(t0);
      clearTimeout(auto);
      clearTimeout(hard);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // lock scroll while visible
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="global-boot"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, filter: "blur(8px)", scale: 1.02 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden bg-[#050507] px-4"
          aria-label="System boot"
          role="status"
          onClick={() => allowedToDismissRef.current && setVisible(false)}
        >
          {/* grid + aurora */}
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_40%,black_60%,transparent_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(45,212,191,0.18),transparent_60%),radial-gradient(ellipse_55%_45%_at_85%_85%,rgba(167,139,250,0.14),transparent_55%)]" />
            {/* scanline */}
            <motion.div
              aria-hidden="true"
              className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent"
              initial={{ top: "0%" }}
              animate={{ top: ["0%", "100%"] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            />
          </div>

          <div className="relative flex w-full max-w-[560px] flex-col items-center">
            {/* top bar */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="font-mono text-[10px] tracking-[0.32em] text-emerald-400/80"
            >
              9TH-GRADE AI // SYSTEM_BOOT <span className="text-zinc-600">v0.2.2</span>
            </motion.p>

            {/* hero mark */}
            <motion.div
              initial={{ scale: 0.86, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.22, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative mt-8 flex h-[132px] w-[132px] items-center justify-center"
            >
              {/* outer counter-rotating ring */}
              <motion.div
                aria-hidden="true"
                className="absolute inset-0 rounded-full border border-emerald-400/20"
                style={{
                  background: "conic-gradient(from 0deg, transparent 0deg, rgba(45,212,191,0.55) 42deg, rgba(167,139,250,0.45) 160deg, transparent 240deg, transparent 360deg)",
                  mask: "radial-gradient(circle, transparent 62%, black 63%)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              />
              {/* inner ring */}
              <motion.div
                aria-hidden="true"
                className="absolute inset-[14%] rounded-full"
                style={{
                  background: "conic-gradient(from 180deg, transparent 0deg, rgba(34,211,238,0.5) 60deg, transparent 200deg)",
                  mask: "radial-gradient(circle, transparent 72%, black 73%)",
                }}
                animate={{ rotate: -360 }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "linear" }}
              />
              {/* core glow */}
              <motion.div
                aria-hidden="true"
                className="absolute inset-[28%] rounded-full bg-gradient-to-br from-emerald-400 via-cyan-400 to-violet-400 blur-[1px]"
                animate={{ scale: [1, 1.06, 1], opacity: [0.95, 1, 0.95] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="absolute inset-[28%] rounded-full bg-[#0a0a0f] shadow-[0_0_32px_rgba(45,212,191,0.6)]" />
              {/* satellites */}
              <motion.div aria-hidden="true" className="absolute inset-0" animate={{ rotate: 360 }} transition={{ duration: 5, repeat: Infinity, ease: "linear" }}>
                {[0, 120, 240].map((deg, i) => (
                  <span
                    key={deg}
                    className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                    style={{ transform: `rotate(${deg}deg) translateX(64px) translate(-50%, -50%)`, opacity: 0.9 - i * 0.15 }}
                  />
                ))}
              </motion.div>
              <span className="relative font-display text-[34px] font-bold tracking-tight text-white drop-shadow-[0_0_16px_rgba(45,212,191,0.55)]">
                9G
              </span>
            </motion.div>

            {/* terminal card */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.38, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="mt-8 w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl"
            >
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="flex-1 text-center font-mono text-[10px] tracking-[0.2em] text-zinc-500">LOADING_TERMINAL — TTY-9G</span>
                <span className="w-[30px]" aria-hidden="true" />
              </div>

              <div className="space-y-1.5 px-4 py-4 font-mono text-xs leading-5">
                {STEPS.map((s, i) => {
                  const done = i < step;
                  const active = i === step;
                  return (
                    <div key={s.label} className="flex items-center gap-2.5">
                      <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${done ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-400" : active ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-white/10 text-zinc-600"}`}>
                        {done ? "✓" : active ? "›" : "·"}
                      </span>
                      <span className={`${done ? "text-zinc-500" : active ? "text-white" : "text-zinc-600"} ${active ? "boot-typing" : ""}`}>
                        <span className="text-emerald-400/70">$</span> {s.label}
                        {active && <span className="ml-1 inline-block h-3 w-[7px] translate-y-px bg-emerald-400/90 align-middle boot-cursor" aria-hidden="true" />}
                      </span>
                      {active && <span className="ml-auto font-mono text-[10px] text-cyan-400/70 tabular-nums">{Math.round(((i + 0.6) / STEPS.length) * 100)}%</span>}
                    </div>
                  );
                })}
              </div>

              {/* progress */}
              <div className="border-t border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-zinc-500">
                  <span>SYSTEM_BOOT</span>
                  <span className="tabular-nums text-emerald-400">{Math.round(progress)}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 shadow-[0_0_12px_rgba(45,212,191,0.5)]"
                    initial={{ width: "0%" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.18 }}
                  />
                </div>
                <div className="mt-1.5 flex gap-1">
                  {Array.from({ length: 24 }, (_, i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${progress > (i / 24) * 100 ? "bg-emerald-400/60" : "bg-white/10"}`}
                    />
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.5 }}
              className="mt-4 text-center font-mono text-[10px] tracking-[0.16em] text-zinc-500"
            >
              PRESS <span className="rounded bg-white/10 px-1 py-0.5 text-zinc-300">ESC</span> OR TAP TO SKIP • EVERY LOAD • NO SKIP BEFORE 0.8S
            </motion.p>
          </div>

          {/* corner brackets */}
          <span aria-hidden="true" className="pointer-events-none absolute left-4 top-4 h-6 w-6 border-l-2 border-t-2 border-emerald-400/20" />
          <span aria-hidden="true" className="pointer-events-none absolute right-4 top-4 h-6 w-6 border-r-2 border-t-2 border-emerald-400/20" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-4 left-4 h-6 w-6 border-b-2 border-l-2 border-emerald-400/20" />
          <span aria-hidden="true" className="pointer-events-none absolute bottom-4 right-4 h-6 w-6 border-b-2 border-r-2 border-emerald-400/20" />

          <style>{`@keyframes bootCursor{0%,45%{opacity:1}50%,100%{opacity:0}}
.boot-cursor{animation:bootCursor 0.9s steps(1) infinite}`}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

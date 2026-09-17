"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MIN_SHOW_MS = 1400;
const MAX_SHOW_MS = 2600;

export default function GlobalBootLoader() {
  const [visible, setVisible] = useState(true);
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
      if (elapsed > 600) allowedToDismissRef.current = true;
    }, 32);

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
          {/* ambient aurora */}
          <div aria-hidden="true" className="absolute inset-0">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(45,212,191,0.18),transparent_60%),radial-gradient(ellipse_55%_45%_at_85%_85%,rgba(167,139,250,0.14),transparent_55%)]" />
          </div>

          <div className="relative flex w-full max-w-[300px] flex-col items-center">
            {/* caption */}
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="font-mono text-[10px] tracking-[0.32em] text-emerald-400/80"
            >
              9TH-GRADE AI
            </motion.p>

            {/* hero mark */}
            <motion.div
              initial={{ scale: 0.86, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.22, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="relative mt-7 flex h-[112px] w-[112px] items-center justify-center"
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
                    style={{ transform: `rotate(${deg}deg) translateX(54px) translate(-50%, -50%)`, opacity: 0.9 - i * 0.15 }}
                  />
                ))}
              </motion.div>
              <span className="relative font-display text-[34px] font-bold tracking-tight text-white drop-shadow-[0_0_16px_rgba(45,212,191,0.55)]">
                9G
              </span>
            </motion.div>

            {/* slim progress */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.4 }}
              className="mt-8 w-full max-w-[220px]"
              role="progressbar"
              aria-label="Loading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-zinc-500">
                <span>LOADING</span>
                <span className="tabular-nums text-emerald-400">{Math.round(progress)}%</span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400"
                  initial={{ width: "0%" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.18 }}
                />
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

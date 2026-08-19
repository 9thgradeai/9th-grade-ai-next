"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

// The cinematic room: a dark scrim sits over the cosmic backdrop and lifts as
// the lamp turns on, while a warm pool of light blooms upward. All animation is
// opacity/transform only (GPU-friendly).
export function AuthEnvironment({ lit, children }: { lit: boolean; children: ReactNode }) {
  return (
    <div className="relative min-h-dvh">
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[#04060c]"
        initial={{ opacity: 0.84 }}
        animate={{ opacity: lit ? 0 : 0.84 }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-[8%] z-0 h-[80vh]"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: lit ? 1 : 0, scale: lit ? 1 : 0.7 }}
        transition={{ duration: 1, ease: "easeOut" }}
        style={{ background: "radial-gradient(closest-side, rgba(251,191,36,0.16), transparent 72%)" }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
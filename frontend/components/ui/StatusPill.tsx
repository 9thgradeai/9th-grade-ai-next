"use client";

import { motion, useReducedMotion } from "framer-motion";

export default function StatusPill({
  label = "ALL SYSTEMS OPERATIONAL",
  color = "emerald",
  className = "",
}: {
  label?: string;
  color?: "emerald" | "cyan" | "indigo";
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();
  const dotColor =
    color === "emerald"
      ? "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]"
      : color === "cyan"
        ? "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)]"
        : "bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.8)]";

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/8 text-[11px] font-mono uppercase tracking-[0.14em] text-emerald-400 ${className}`}
    >
      <motion.span
        className={`w-1.5 h-1.5 rounded-full ${dotColor}`}
        animate={
          shouldReduceMotion
            ? { opacity: 1 }
            : { opacity: [1, 0.45, 1] }
        }
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      />
      {label}
    </motion.span>
  );
}
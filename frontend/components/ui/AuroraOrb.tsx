"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Shared ambient aurora orb — the product's signature depth accent.
 * Replaces the copy-pasted blurred-circle recipe used across the hero,
 * page heroes, and CTA sections.
 *
 * GPU-cheap: animates scale only, static under reduced motion.
 * Positioning (absolute/fixed + offsets) is owned by the caller via
 * `className`; wrap in a `motion.div` for scroll parallax.
 */
export default function AuroraOrb({
  className = "",
  colorClass = "bg-emerald-500/10",
  size = "42rem",
  blur = "130px",
  duration = 12,
  breatheTo = 1.07,
  delay = 0,
}: {
  className?: string;
  colorClass?: string;
  /** CSS width/height of the orb, e.g. "42rem" or "36rem". */
  size?: string;
  blur?: string;
  duration?: number;
  breatheTo?: number;
  delay?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size, filter: `blur(${blur})` }}
      className={`rounded-full ${colorClass} pointer-events-none ${className}`}
    >
      <motion.div
        className="h-full w-full rounded-full"
        animate={shouldReduceMotion ? undefined : { scale: [1, breatheTo, 1] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
      />
    </div>
  );
}

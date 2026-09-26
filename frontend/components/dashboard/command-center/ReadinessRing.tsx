"use client";

import { useEffect, type ReactNode } from "react";
import { motion, useSpring } from "framer-motion";
import { useMotionTier } from "@/lib/motion/use-motion-tier";

/**
 * Shared ring gauge (Command Deck) — the single ring implementation used by
 * the Home header (readiness ring) and TodayMission (orbit gauge). Do not
 * build a second ring; parameterize this one.
 *
 * Progress animates via a framer-motion spring on `strokeDashoffset` (an SVG
 * presentation attribute, not a layout property). Under low-tier hardware or
 * `prefers-reduced-motion` the final offset renders directly with no spring.
 */
export default function ReadinessRing({
  value,
  size = 96,
  strokeWidth = 8,
  center,
  label,
  ariaLabel,
  ambientGlow = false,
}: {
  /** Progress 0–100 (clamped). */
  value: number;
  size?: number;
  strokeWidth?: number;
  /** Rendered centered inside the ring (e.g. days-left number). */
  center?: ReactNode;
  /** Small caption rendered under the center content. */
  label?: ReactNode;
  ariaLabel?: string;
  /** Adds the shared ambient glow layer (only Hero + header ring may use). */
  ambientGlow?: boolean;
}) {
  const { fullMotion } = useMotionTier();
  const clamped = Math.max(0, Math.min(100, value));
  const r = 50 - strokeWidth / 2;
  const circumference = 2 * Math.PI * r;
  const targetOffset = circumference * (1 - clamped / 100);

  const spring = useSpring(targetOffset, { stiffness: 120, damping: 22 });
  useEffect(() => {
    spring.set(targetOffset);
  }, [spring, targetOffset]);

  return (
    <div
      className="relative inline-flex flex-col items-center justify-center"
      role="img"
      aria-label={ariaLabel ?? `Progress ${Math.round(clamped)} percent`}
    >
      {ambientGlow && <span className="cd-glow-layer" aria-hidden="true" />}
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90" aria-hidden="true">
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--cd-ring-track)"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke="var(--cd-ring-progress)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            // Instant paint when motion is gated off — skip the spring.
            style={{ strokeDashoffset: fullMotion ? spring : targetOffset }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {center}
          {label}
        </div>
      </div>
    </div>
  );
}

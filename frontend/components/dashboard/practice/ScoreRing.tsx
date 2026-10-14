"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * ScoreRing — animated SVG score ring for result panels.
 * Counts up unless the user prefers reduced motion.
 */
export default function ScoreRing({
  percentage,
  size = 120,
  label,
}: {
  percentage: number;
  size?: number;
  label?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? Math.round(percentage) : 0);
  useEffect(() => {
    if (reduceMotion) {
      setDisplay(Math.round(percentage));
      return;
    }
    const target = Math.max(0, Math.min(100, percentage));
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [percentage, reduceMotion]);

  const pct = Math.max(0, Math.min(100, display));
  const R = 52;
  const C = 2 * Math.PI * R;
  const color =
    percentage >= 80
      ? "var(--dashboard-warning)"
      : percentage >= 50
        ? "var(--dashboard-primary)"
        : "var(--dashboard-danger)";

  return (
    <div
      className="inline-flex flex-col items-center"
      role="progressbar"
      aria-label={label ?? "Score"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percentage)}
    >
      <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--dashboard-border-muted)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct / 100)}
          style={{ transition: reduceMotion ? undefined : "stroke-dashoffset 0.1s linear" }}
        />
      </svg>
      <div className="-mt-[76px] mb-[52px] text-center pointer-events-none">
        <span className="text-2xl font-bold font-mono tabular-nums" style={{ color }}>
          {display}%
        </span>
      </div>
    </div>
  );
}

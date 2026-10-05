"use client";

import { Clock } from "@phosphor-icons/react";
import { calmTimerLevel, formatClock } from "@/lib/exam-calm";

/**
 * Phase 3 calm countdown — tabular numerals, progress bar, pulse ONLY at
 * ≤60s (motion-reduce safe). aria-live polite so screen readers aren't
 * spammed every second.
 */
export default function CalmCountdown({
  remainingSec,
  totalSec,
  answered,
  total,
}: {
  remainingSec: number;
  totalSec: number;
  answered: number;
  total: number;
}) {
  const level = calmTimerLevel(remainingSec);
  const pct = totalSec > 0 ? Math.max(0, Math.min(100, (remainingSec / totalSec) * 100)) : 0;
  const color =
    level === "critical"
      ? "var(--dashboard-danger)"
      : level === "low"
        ? "var(--dashboard-warning)"
        : "var(--dashboard-primary)";

  return (
    <div className="flex items-center gap-3 min-w-0" role="timer" aria-live="polite" aria-label={`${formatClock(remainingSec)} remaining`}>
      <Clock
        className={`w-4 h-4 shrink-0 ${level === "critical" ? "animate-pulse motion-reduce:animate-none" : ""}`}
        style={{ color }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <span className="font-mono text-lg font-bold tabular-nums" style={{ color }}>
          {formatClock(remainingSec)}
        </span>
        <span className="ml-2 text-xs text-[var(--dashboard-text-muted)] font-mono tabular-nums">
          উত্তর: {answered} / {total}
        </span>
        <div className="mt-1 h-1 w-32 overflow-hidden rounded-full" style={{ background: "var(--dashboard-surface-muted)" }} aria-hidden="true">
          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

function formatClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

/**
 * Wall-clock session countdown. The deadline is derived from
 * `startsAt + durationSec` (authoritative, survives remounts and tab
 * switches), the 1s interval only re-renders this leaf. Expiry fires once.
 */
export default function SessionTimer({
  startsAt,
  durationSec,
  onExpire,
}: {
  startsAt: number;
  durationSec: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, durationSec - Math.floor((Date.now() - startsAt) / 1000)),
  );

  useEffect(() => {
    let fired = false;
    const tick = () => {
      const rem = Math.max(0, durationSec - Math.floor((Date.now() - startsAt) / 1000));
      setRemaining(rem);
      if (rem <= 0 && !fired) {
        fired = true;
        clearInterval(id);
        onExpire();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
    };
    // onExpire is ref-stable at call sites via useCallback; startsAt/duration
    // identify the attempt and must reset the clock when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startsAt, durationSec]);

  const low = remaining > 0 && remaining <= 60;
  const critical = remaining > 0 && remaining <= 15;
  const color = critical
    ? "var(--dashboard-danger)"
    : low
      ? "var(--dashboard-warning)"
      : "var(--dashboard-text-muted)";
  const label = `বাকি সময় ${Math.floor(remaining / 60)} মিনিট ${remaining % 60} সেকেন্ড`;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="timer"
      aria-live="off"
      aria-label={label}
      title={label}
    >
      <span
        aria-hidden="true"
        className={`font-mono text-sm font-bold tabular-nums ${critical ? "animate-pulse motion-reduce:animate-none" : ""}`}
        style={{ color }}
      >
        {formatClock(remaining)}
      </span>
      <span className="sr-only" aria-live="polite">
        {low || remaining === durationSec ? label : ""}
      </span>
    </span>
  );
}

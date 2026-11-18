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
 *
 * `regime` labels the session semantics for the user (P-U4): what happens to
 * an unanswered session when the clock runs out.
 *  - "deadline"     — wall-clock session deadline; on expiry the session
 *                    auto-submits (mock / custom exams).
 *  - "advance-only" — per-question advance; each question gets its own
 *                    `QUESTION_TIME_LIMIT` and a timeout auto-submits that
 *                    question's attempt (quick practice).
 */
export default function SessionTimer({
  startsAt,
  durationSec,
  onExpire,
  regime,
}: {
  startsAt: number;
  durationSec: number;
  onExpire: () => void;
  regime?: "deadline" | "advance-only";
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

  const regimeLabel =
    regime === "deadline"
      ? "Session deadline · auto-submit on expiry"
      : regime === "advance-only"
        ? "Advance-only · per-question time, auto-submit on timeout"
        : undefined;

  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="timer"
      aria-live="off"
      aria-label={label}
      title={label}
    >
      {regimeLabel && (
        <span
          className="text-xs font-mono"
          style={{ color: "var(--dashboard-text-muted)" }}
          data-timer-regime={regime}
        >
          {regimeLabel}
        </span>
      )}
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

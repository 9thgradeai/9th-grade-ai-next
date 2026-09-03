"use client";

import { useEffect, useState } from "react";

/* ── Data-boot loader primitives (dashboard loading vocabulary) ────────────
   Pure CSS visuals driven by the keyframes in globals.css. The only client
   piece is StatusText, which cycles a terminal status line. All decorative
   elements are aria-hidden; the real status message is announced to screen
   readers via a visually-hidden live region. */

/** Rotating aurora conic ring + core with orbiting satellites. */
export function AuroraRing({
  size = 72,
  label = "লোড হচ্ছে",
}: {
  size?: number;
  label?: string;
}) {
  const satPositions = [0, 90, 180, 270];
  return (
    <div
      role="status"
      aria-label={label}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* soft ambient halo behind the ring */}
      <div
        aria-hidden="true"
        className="absolute inset-[-18%] rounded-full bg-[rgb(from_var(--primary)_r_g_b_/_0.1)] blur-2xl boot-core"
      />
      {/* rotating aurora ring */}
      <div
        aria-hidden="true"
        className="boot-ring absolute inset-0 shadow-[0_0_30px_rgb(from_var(--primary)_r_g_b_/_0.35)]"
      />
      {/* core */}
      <div
        aria-hidden="true"
        className="boot-core absolute rounded-full"
        style={{
          width: size * 0.34,
          height: size * 0.34,
          background:
            "radial-gradient(circle at 30% 30%, var(--primary), var(--info) 70%, var(--primary))",
          boxShadow: "0 0 24px rgb(from var(--primary) r g b / 0.65)",
        }}
      />
      {/* orbiting satellites */}
      <div
        aria-hidden="true"
        className="boot-orbit absolute inset-0"
        style={{ animationDuration: "5s" }}
      >
        {satPositions.map((deg) => (
          <span
            key={deg}
            className="boot-twinkle absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: size * 0.09,
              height: size * 0.09,
              background: deg % 180 === 0 ? "var(--info)" : "var(--primary)",
              transform: `rotate(${deg}deg) translateX(${size / 2}px)`,
              animationDelay: `${deg * 0.12}s`,
            }}
          />
        ))}
      </div>
      {/* centered glyph — the animated subject sits on top */}
      <div className="relative z-10" aria-hidden="true">
        <span className="text-gradient font-display font-bold" style={{ fontSize: size * 0.3 }}>
          9G
        </span>
      </div>
    </div>
  );
}

/** Typewriter / cycling terminal status line with a blinking cursor. */
export function StatusText({
  messages = ["initializing modules", "syncing data", "calibrating accuracy"],
  interval = 1800,
  className = "",
}: {
  messages?: string[];
  interval?: number;
  className?: string;
}) {
  const [i, setI] = useState(0);
  const [chars, setChars] = useState(0);

  useEffect(() => {
    const msg = messages[i % messages.length] ?? "";
    if (chars < msg.length) {
      const t = setTimeout(() => setChars((c) => c + 1), 28);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setI((v) => v + 1);
      setChars(0);
    }, interval);
    return () => clearTimeout(t);
  }, [i, chars, messages, interval]);

  const current = messages[i % messages.length] ?? "";

  return (
    <div className={className}>
      <span
        className="inline-block text-[var(--dashboard-primary)]/90 font-mono text-sm tabular-nums boot-msg"
        aria-hidden="true"
      >
        <span className="text-[var(--dashboard-primary)]">$</span> {current.slice(0, chars)}
        <span className="cursor-blink" aria-hidden="true" />
      </span>
      <span className="sr-only" role="status">
        {current}
      </span>
    </div>
  );
}

/** Indeterminate segmented progress bar with an aurora fill. */
export function BootProgress({
  segments = 12,
  label = "loading",
}: {
  segments?: number;
  label?: string;
}) {
  return (
    <div role="progressbar" aria-label={label} className="w-full max-w-xs">
      <div className="boot-progress-bar h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
        <span
          style={{
            background:
              "linear-gradient(90deg, var(--primary), var(--info) 40%, var(--primary) 70%, var(--info))",
            boxShadow: "0 0 12px rgb(from var(--primary) r g b / 0.6)",
          }}
        />
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {Array.from({ length: segments }, (_, s) => (
          <span
            key={s}
            className="boot-seg h-1 flex-1 rounded-full bg-[rgb(from_var(--primary)_r_g_b_/_0.6)]"
            style={{ animationDelay: `${s * 0.12}s` }}
          />
        ))}
      </div>
    </div>
  );
}

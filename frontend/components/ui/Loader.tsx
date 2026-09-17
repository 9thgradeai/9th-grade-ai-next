"use client";

/* ── Data-boot loader primitives (dashboard loading vocabulary) ────────────
   Pure CSS visuals driven by the keyframes in globals.css. AuroraRing is the
   9G circle mark; BootProgress is the slim segmented bar. All decorative
   elements are aria-hidden; roles/labels announce state to screen readers. */

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

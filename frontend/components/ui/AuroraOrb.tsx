"use client";

/**
 * Shared ambient aurora orb, the product's signature depth accent.
 * Replaces the copy-pasted blurred-circle recipe used across the hero,
 * page heroes, and CTA sections.
 *
 * GPU-cheap: animates scale only via a pure CSS keyframe (`.aurora-breathe`),
 * static under reduced motion. No framer-motion runtime required.
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
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size, filter: `blur(${blur})` }}
      className={`rounded-full ${colorClass} pointer-events-none ${className}`}
    >
      <div
        className="aurora-breathe h-full w-full rounded-full"
        style={
          {
            "--aurora-duration": `${duration}s`,
            "--aurora-breathe-to": breatheTo,
            "--aurora-delay": `${delay}s`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

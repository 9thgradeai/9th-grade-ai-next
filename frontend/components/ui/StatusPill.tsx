"use client";

/**
 * Small status indicator pill (e.g. "SYSTEM: ONLINE"). The pulsing dot is a pure
 * CSS animation, so no animation library is pulled into the initial bundle.
 */
export default function StatusPill({
  label = "ALL SYSTEMS OPERATIONAL",
  color = "emerald",
  className = "",
}: {
  label?: string;
  color?: "emerald" | "cyan" | "indigo";
  className?: string;
}) {
  const dotColor =
    color === "emerald"
      ? "bg-[var(--primary)] shadow-[0_0_12px_var(--primary)]"
      : color === "cyan"
        ? "bg-[var(--info)] shadow-[0_0_12px_var(--info)]"
        : "bg-[var(--primary)] shadow-[0_0_12px_var(--primary)]";

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--primary)]/20 bg-[var(--dashboard-primary-subtle)] text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--dashboard-primary)] ${className}`}
    >
      <span
        className={`status-dot-pulse w-1.5 h-1.5 rounded-full ${dotColor}`}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

// src/components/ui/Badge.tsx — pill/status badge used across the app.

import { clsx } from "clsx";

type BadgeProps = {
  children: React.ReactNode;
  color?: "emerald" | "cyan" | "amber" | "rose" | "violet" | "zinc";
  className?: string;
};

const COLORS: Record<NonNullable<BadgeProps["color"]>, string> = {
  emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  rose: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  violet: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  zinc: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
};

export function Badge({ children, color = "emerald", className }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono border",
        COLORS[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default Badge;

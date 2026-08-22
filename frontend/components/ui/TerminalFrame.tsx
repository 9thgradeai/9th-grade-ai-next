import type { ReactNode } from "react";

/**
 * Shared terminal-window chrome — the product's signature card treatment.
 * Replaces the `.terminal-window-bar` + traffic-light dots markup repeated
 * across nine components. Dots are purely decorative.
 */
export default function TerminalFrame({
  title,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: ReactNode;
  children: ReactNode;
  /** Extra classes on the outer frame. */
  className?: string;
  /** Extra classes on the content wrapper below the title bar. */
  bodyClassName?: string;
}) {
  return (
    <div
      className={`glass-card rounded-2xl border border-terminal-border overflow-hidden ${className}`}
    >
      <div className="terminal-window-bar border-b border-terminal-border">
        <span className="dot close" aria-hidden="true" />
        <span className="dot minimize" aria-hidden="true" />
        <span className="dot maximize" aria-hidden="true" />
        <div className="flex-1 truncate text-center font-mono text-xs text-zinc-400">{title}</div>
        {/* Balance the centered title against the dot cluster width */}
        <span aria-hidden="true" className="w-[52px]" />
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/** Header row for dashboard cards: mono eyebrow-style title + trailing action. */
export function CardHeader({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.16em] text-zinc-400">
        {icon}
        {title}
      </h3>
      {action}
    </div>
  );
}

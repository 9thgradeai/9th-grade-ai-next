import type { ComponentType, ReactNode } from "react";

/**
 * Single empty-state primitive. Explains why a surface is empty and offers
 * the next action — replaces the icon+text+button block copy-pasted across
 * dashboard tabs and landing sections.
 */
export default function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  compact = false,
}: {
  icon?: ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${
        compact ? "py-6 gap-2" : "py-12 gap-3"
      }`}
    >
      {Icon && (
        <span className="relative mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
          <span className="absolute inset-0 rounded-full bg-emerald-500/15 blur-md" aria-hidden="true" />
          <Icon className="relative h-5 w-5 text-emerald-400" aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed text-zinc-500">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

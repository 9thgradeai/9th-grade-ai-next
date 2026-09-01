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
  icon?: ComponentType<{ className?: string; style?: React.CSSProperties; "aria-hidden"?: boolean | "true" | "false" }>;
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
        <span className="relative mb-1 inline-flex h-12 w-12 items-center justify-center rounded-full border" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
          <Icon className="relative h-5 w-5" style={{ color: "var(--dashboard-primary)" }} aria-hidden="true" />
        </span>
      )}
      <p className="text-sm font-medium" style={{ color: "var(--dashboard-text-primary)" }}>{title}</p>
      {hint && <p className="max-w-xs text-xs leading-relaxed" style={{ color: "var(--dashboard-text-muted)" }}>{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

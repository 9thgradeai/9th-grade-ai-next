import type { ReactNode } from "react";

const ACCENTS: Record<string, { dot: string }> = {
  emerald: { dot: "bg-[var(--success)]" },
  cyan: { dot: "bg-[var(--info)]" },
  indigo: { dot: "bg-[var(--accent)]" },
  amber: { dot: "bg-[var(--warning)]" },
  rose: { dot: "bg-[var(--danger)]" },
  zinc: { dot: "bg-[var(--text-muted)]" },
} as const;

export type KpiAccent = keyof typeof ACCENTS;

export default function KpiTile({
  label,
  value,
  hint,
  accent = "emerald",
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: KpiAccent;
  loading?: boolean;
}) {
  const tone = ACCENTS[accent] ?? ACCENTS.zinc;
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 shadow-sm transition-colors"
    >
      <p className="flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
        {label}
      </p>
      {loading ? (
        <div aria-hidden="true" className="mt-3 h-7 w-16 animate-pulse rounded-md" style={{ background: "var(--surface-muted)" }} />
      ) : (
        <p className="mt-2 font-display text-2xl font-semibold tabular-nums leading-none" style={{ color: "var(--text-primary)" }}>
          {value}
        </p>
      )}
      {hint && !loading && <p className="mt-1.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

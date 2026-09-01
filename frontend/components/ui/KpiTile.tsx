import type { ReactNode } from "react";

const ACCENTS: Record<string, { dot: string }> = {
  emerald: { dot: "bg-emerald-500" },
  cyan: { dot: "bg-cyan-500" },
  indigo: { dot: "bg-indigo-500" },
  amber: { dot: "bg-amber-500" },
  rose: { dot: "bg-rose-500" },
  zinc: { dot: "bg-slate-400" },
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
      className="rounded-2xl border p-4 transition-colors"
      style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", boxShadow: "var(--dashboard-shadow-sm)" }}
    >
      <p className="flex items-center gap-1.5 truncate text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--dashboard-text-muted)" }}>
        <span className={`w-1.5 h-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
        {label}
      </p>
      {loading ? (
        <div aria-hidden="true" className="mt-3 h-7 w-16 animate-pulse rounded-md" style={{ background: "var(--dashboard-surface-muted)" }} />
      ) : (
        <p className="mt-2 font-display text-2xl font-semibold tabular-nums leading-none" style={{ color: "var(--dashboard-text-primary)" }}>
          {value}
        </p>
      )}
      {hint && !loading && <p className="mt-1.5 truncate text-xs" style={{ color: "var(--dashboard-text-muted)" }}>{hint}</p>}
    </div>
  );
}

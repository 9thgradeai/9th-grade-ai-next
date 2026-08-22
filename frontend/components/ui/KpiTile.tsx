import type { ReactNode } from "react";

const ACCENTS = {
  emerald: { value: "text-emerald-400", ring: "border-emerald-400/20 bg-emerald-400/[0.04]" },
  cyan: { value: "text-cyan-400", ring: "border-cyan-400/20 bg-cyan-400/[0.04]" },
  indigo: { value: "text-indigo-400", ring: "border-indigo-400/20 bg-indigo-400/[0.04]" },
  amber: { value: "text-amber-400", ring: "border-amber-400/20 bg-amber-400/[0.04]" },
  rose: { value: "text-rose-400", ring: "border-rose-400/20 bg-rose-400/[0.04]" },
  zinc: { value: "text-zinc-200", ring: "border-white/10 bg-white/[0.03]" },
} as const;

export type KpiAccent = keyof typeof ACCENTS;

/**
 * Unified stat tile — one visual language for every KPI surface
 * (dashboard home strip, progress overview, exam results).
 */
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
  const tone = ACCENTS[accent];
  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${tone.ring} hover:border-white/20`}
    >
      <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        {label}
      </p>
      {loading ? (
        <div aria-hidden="true" className="mt-2 h-7 w-16 animate-pulse rounded-md bg-white/10" />
      ) : (
        <p className={`mt-1.5 font-display text-2xl font-semibold tabular-nums leading-none ${tone.value}`}>
          {value}
        </p>
      )}
      {hint && !loading && <p className="mt-1.5 truncate text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

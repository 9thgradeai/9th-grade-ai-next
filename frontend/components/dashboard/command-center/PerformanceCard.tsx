"use client";
import { useMemo } from "react";
import { Activity, TrendingUp } from "lucide-react";

type ActivityPoint = { date: string; answered: number; correct: number };

export default function PerformanceCard({ activity, results, range, onRangeChange, loading }: { activity: ActivityPoint[]; results: { score: number }[]; range: "7D"|"30D"|"ALL"; onRangeChange: (r:"7D"|"30D"|"ALL")=>void; loading?: boolean }) {
  const points = activity;
  const max = Math.max(1, ...points.map((p) => p.answered), 1);
  const accuracy = useMemo(() => {
    const tot = points.reduce((s, p) => s + p.answered, 0);
    const cor = points.reduce((s, p) => s + p.correct, 0);
    return tot ? Math.round((cor / tot) * 100) : 0;
  }, [points]);

  const totalSolved = points.reduce((s, p) => s + p.answered, 0);

  const W = 320, H = 64, pad = 6;
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${pad + i * step} ${H - pad - (p.answered / max) * (H - pad * 2)}`).join(" ");
  const area = points.length ? `${d} L ${pad + (points.length - 1) * step} ${H - pad} L ${pad} ${H - pad} Z` : "";

  return (
    <div className="command-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="command-eyebrow">Performance</p>
          <h3 className="font-display font-bold text-[16px] mt-1" style={{ color: "var(--dashboard-text-primary)" }}>Preparation overview</h3>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>{totalSolved} solved · {accuracy}% accuracy · {range} window {loading ? "· loading…" : ""}</p>
        </div>
        <div className="flex items-center rounded-full border p-1 gap-1" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
          {(["7D", "30D", "ALL"] as const).map((r) => (
            <button key={r} onClick={() => onRangeChange(r)} aria-pressed={range===r} className="px-3 py-1 rounded-full text-xs font-bold transition-colors" style={range === r ? { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" } : { color: "var(--dashboard-text-muted)" }}>{r}</button>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border p-3" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
        {points.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--dashboard-text-muted)" }}>No activity yet — start practicing to see your trend.</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[96px]" role="img" aria-label="Preparation trend">
              <path d={area} fill="color-mix(in srgb, var(--dashboard-primary) 14%, transparent)" />
              <path d={d} fill="none" stroke="var(--dashboard-primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={pad + i * step} cy={H - pad - (p.answered / max) * (H - pad * 2)} r="3" fill="var(--dashboard-primary)" stroke="var(--dashboard-surface)" strokeWidth="1.2" />
              ))}
            </svg>
            <div className="flex justify-between text-[10px] font-medium mt-1 overflow-hidden" style={{ color: "var(--dashboard-text-muted)" }}>
              {points.slice(-7).map((p, i) => (
                <span key={i} className="truncate">{new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border px-3 py-2.5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>Solved</p>
          <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{totalSolved}</p>
        </div>
        <div className="rounded-xl border px-3 py-2.5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: "var(--dashboard-text-muted)" }}><TrendingUp className="w-3 h-3" /> Accuracy</p>
          <p className="text-sm font-bold" style={{ color: "var(--dashboard-success)" }}>{accuracy}%</p>
        </div>
        <div className="rounded-xl border px-3 py-2.5" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: "var(--dashboard-text-muted)" }}><Activity className="w-3 h-3" /> Last score</p>
          <p className="text-sm font-bold" style={{ color: "var(--dashboard-text-primary)" }}>{results.length ? `${results[results.length - 1]?.score ?? 0}%` : "—"}</p>
        </div>
      </div>
    </div>
  );
}

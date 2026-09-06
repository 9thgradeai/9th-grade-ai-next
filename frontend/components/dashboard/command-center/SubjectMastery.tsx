"use client";
import { ArrowRight } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type Report = { name: string; score: number; attempted: number; correct: number };

export default function SubjectMastery({ reports }: { reports: Report[] }) {
  const { setActiveTab } = useDashboardStore();
  const sorted = [...reports].filter((r) => r.attempted > 0).sort((a, b) => b.score - a.score);
  const display = sorted.slice(0, 8);
  return (
    <div className="command-card p-5 sm:p-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="command-eyebrow">Subject Mastery</p>
          <h3 className="font-display font-bold text-[16px] mt-1" style={{ color: "var(--dashboard-text-primary)" }}>Performance by subject</h3>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>Weak subjects surface first for fast intervention</p>
        </div>
        <button onClick={() => setActiveTab("progress")} className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--dashboard-primary)" }}>View analytics <ArrowRight className="w-3.5 h-3.5" /></button>
      </div>

      {display.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
          <p className="text-sm font-medium" style={{ color: "var(--dashboard-text-primary)" }}>Solve questions to see mastery</p>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>Your subject accuracy will appear here.</p>
          <button onClick={() => setActiveTab("practice")} className="command-primary-btn mt-4">Start Practice</button>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {display.map((r) => {
            const pct = Math.round((r.correct / Math.max(1, r.attempted)) * 100);
            const isWeak = pct < 65;
            return (
              <div key={r.name} className="rounded-2xl border p-4 flex flex-col gap-3" style={{ background: isWeak ? "var(--dashboard-danger-subtle)" : "var(--dashboard-surface-muted)", borderColor: isWeak ? "color-mix(in srgb, var(--dashboard-danger) 16%, var(--dashboard-border-muted))" : "var(--dashboard-border-muted)" }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-semibold leading-tight line-clamp-2" style={{ color: "var(--dashboard-text-primary)" }}>{r.name}</p>
                  <span className="shrink-0 text-xs font-mono font-bold px-2 py-1 rounded-full border" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", color: isWeak ? "var(--dashboard-danger)" : "var(--dashboard-success)" }}>{pct}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: "var(--dashboard-surface)" }} aria-hidden="true">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: isWeak ? "var(--dashboard-danger)" : pct >= 80 ? "var(--dashboard-success)" : "var(--dashboard-warning)" }} />
                </div>
                <p className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>{r.attempted} attempted · {r.correct} correct</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

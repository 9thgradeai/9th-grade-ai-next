"use client";
import { AlertCircle, ArrowRight } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type Report = { name: string; score: number; attempted: number; correct: number };
export default function FocusAreasCard({ reports, onPractice, onOpenMistakes }: { reports: Report[]; onPractice: (subject: string) => void; onOpenMistakes: (subject?: string) => void }) {
  const { setActiveTab } = useDashboardStore();
  const weakest = [...reports].filter((r) => r.attempted > 0).sort((a, b) => a.score - b.score).slice(0, 3);
  return (
    <div className="command-card p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--dashboard-warning-subtle)", color: "var(--dashboard-warning)", border: "1px solid color-mix(in srgb, var(--dashboard-warning) 18%, transparent)" }}><AlertCircle className="w-4 h-4" /></span>
        <p className="command-eyebrow !text-[10px]">Focus Areas</p>
        <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)" }}>{weakest.length} to fix</span>
      </div>
      {weakest.length === 0 ? (
        <p className="mt-4 text-sm" style={{ color: "var(--dashboard-text-muted)" }}>No focus areas yet. Solve more questions to detect gaps.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {weakest.map((r) => (
            <div key={r.name} className="flex items-center gap-3 rounded-xl border p-3" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--dashboard-text-primary)" }}>{r.name}</p>
                <p className="text-xs" style={{ color: "var(--dashboard-text-muted)" }}>{r.score}% accuracy · {r.attempted} attempted</p>
              </div>
              <span className="text-xs font-mono font-bold" style={{ color: "var(--dashboard-danger)" }}>{r.score}%</span>
              <button onClick={() => onPractice(r.name)} className="command-secondary-btn !px-3 !py-1.5 !text-xs shrink-0">Practice</button>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => onOpenMistakes()} className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold py-2.5 rounded-xl border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)", background: "var(--dashboard-surface)" }}>
        Open Wrong Answers <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

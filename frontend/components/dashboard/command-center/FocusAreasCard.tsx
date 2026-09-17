"use client";

import { AlertCircle, ArrowRight, Zap, Target } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type Report = { name: string; score: number; attempted: number; correct: number };

export default function FocusAreasCard({
  reports,
  onPractice,
  onOpenMistakes,
}: {
  reports: Report[];
  onPractice: (subject: string) => void;
  onOpenMistakes: (subject?: string) => void;
}) {
  const { setActiveTab } = useDashboardStore();
  const weakest = [...reports].filter((r) => r.attempted > 0).sort((a, b) => a.score - b.score).slice(0, 3);

  return (
    <div className="command-card p-5 sm:p-6 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-sm"
              style={{
                background: "var(--dashboard-danger-subtle)",
                color: "var(--dashboard-danger)",
                borderColor: "color-mix(in srgb, var(--dashboard-danger) 20%, transparent)",
              }}
            >
              <AlertCircle className="w-4 h-4" />
            </span>
            <p className="command-eyebrow !text-[10px]">Priority Focus Areas</p>
          </div>
          <span
            className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border font-mono"
            style={{ background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 20%, transparent)" }}
          >
            {weakest.length} Topics Needing Revision
          </span>
        </div>

        {weakest.length === 0 ? (
          <p className="mt-6 text-sm text-center py-6" style={{ color: "var(--dashboard-text-muted)" }}>
            No critical weak areas detected. Continue solving mock tests to surface potential focus areas.
          </p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {weakest.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between gap-3 rounded-xl border p-3 transition-all hover:border-[var(--dashboard-primary)]/40"
                style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: "var(--dashboard-text-primary)" }}>
                    {r.name}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                    {r.score}% accuracy · {r.attempted} attempted
                  </p>
                </div>
                <span className="text-xs font-mono font-extrabold" style={{ color: "var(--dashboard-danger)" }}>
                  {r.score}%
                </span>
                <button
                  onClick={() => onPractice(r.name)}
                  className="command-secondary-btn !px-3 !py-1.5 !text-xs shrink-0 hover:border-[var(--dashboard-primary)]"
                >
                  Drill <Zap className="w-3 h-3 text-[var(--dashboard-primary)]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => onOpenMistakes()}
        className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold py-2.5 rounded-xl border transition-colors hover:border-[var(--dashboard-primary)]"
        style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)", background: "var(--dashboard-surface)" }}
      >
        Open Wrong Answers Notebook <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

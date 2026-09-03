"use client";

import { ArrowRight, Zap } from "lucide-react";
import type { NextAction } from "@/lib/dashboard/recommend";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

const INTENSITY_STYLE: Record<NextAction["intensity"], React.CSSProperties> = {
  high: { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)", borderColor: "var(--dashboard-primary)" },
  medium: { background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" },
  low: { background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" },
};

export default function NextBestAction({ action }: { action: NextAction }) {
  const { setActiveTab } = useDashboardStore();
  const isHigh = action.intensity === "high";

  return (
    <section
      aria-label="পরবর্তী সেরা পদক্ষেপ"
      className="relative overflow-hidden rounded-2xl border p-5 sm:p-6"
      style={isHigh ? INTENSITY_STYLE.high : INTENSITY_STYLE[action.intensity]}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
            style={
              isHigh
                ? { background: "rgba(10,11,16,0.14)", borderColor: "rgba(10,11,16,0.18)", color: "var(--dashboard-text-inverse)" }
                : { background: "var(--dashboard-primary-subtle)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }
            }
          >
            <Zap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: isHigh ? "var(--dashboard-text-inverse)" : "var(--dashboard-primary)" }}>
              পরবর্তী সেরা পদক্ষেপ
            </p>
            <h2 className="text-balance text-[17px] font-semibold leading-tight" style={{ color: isHigh ? "var(--dashboard-text-inverse)" : "var(--dashboard-text-primary)" }}>{action.title}</h2>
            <p className="mt-1.5 leading-relaxed text-[13px]" style={{ color: isHigh ? "var(--dashboard-text-inverse)" : "var(--dashboard-text-secondary)" }}>{action.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab(action.tab)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={
            isHigh
              ? { background: "var(--dashboard-text-inverse)", color: "var(--dashboard-primary)" }
              : { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }
          }
        >
          {action.cta}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

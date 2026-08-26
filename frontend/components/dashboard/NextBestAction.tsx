"use client";

import { ArrowRight, Zap } from "lucide-react";
import type { NextAction } from "@/lib/dashboard/recommend";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

const INTENSITY_CLASS: Record<NextAction["intensity"], string> = {
  high: "from-emerald-500/[0.12] to-cyan-500/[0.06] border-emerald-500/30",
  medium: "from-indigo-500/[0.10] to-cyan-500/[0.05] border-indigo-500/25",
  low: "from-zinc-500/[0.08] to-zinc-500/[0.04] border-zinc-700",
};

export default function NextBestAction({ action }: { action: NextAction }) {
  const { setActiveTab } = useDashboardStore();

  return (
    <section
      aria-label="পরবর্তী সেরা পদক্ষেপ"
      className={`relative overflow-hidden rounded-2xl border bg-gradient-to-r p-5 ${INTENSITY_CLASS[action.intensity]}`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/15">
            <Zap className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">
              পরবর্তী সেরা পদক্ষেপ
            </p>
            <h2 className="text-balance text-lg font-semibold text-white">{action.title}</h2>
            <p className="mt-1 leading-relaxed text-sm text-zinc-300">{action.description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab(action.tab)}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
        >
          {action.cta}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

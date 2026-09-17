"use client";

import { useState, useMemo } from "react";
import { ArrowRight, Search, Layers, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type Report = { name: string; score: number; attempted: number; correct: number };
type FilterTab = "all" | "weak" | "mastered";

export default function SubjectMastery({ reports, onPractice }: { reports: Report[]; onPractice: (subject: string) => void }) {
  const { setActiveTab } = useDashboardStore();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const activeReports = useMemo(() => {
    return reports.filter((r) => r.attempted > 0);
  }, [reports]);

  const filteredReports = useMemo(() => {
    return activeReports
      .filter((r) => {
        const pct = Math.round((r.correct / Math.max(1, r.attempted)) * 100);
        if (filter === "weak") return pct < 65;
        if (filter === "mastered") return pct >= 80;
        return true;
      })
      .filter((r) => r.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.score - a.score);
  }, [activeReports, filter, search]);

  return (
    <div className="command-card p-5 sm:p-6 flex flex-col">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="command-eyebrow flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Subject Knowledge Matrix
          </p>
          <h3 className="font-display font-extrabold text-[16px] mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>
            Performance & Mastery by Topic
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
            Tap any subject card to trigger a targeted AI practice session
          </p>
        </div>

        {/* Filter Pills + Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--dashboard-text-muted)]" />
            <input
              type="text"
              placeholder="Search topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1 text-xs rounded-lg border focus:outline-none focus:border-[var(--dashboard-primary)]"
              style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-primary)" }}
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center rounded-lg border p-0.5" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
            {(
              [
                { id: "all", label: "All" },
                { id: "weak", label: "Weak <65%" },
                { id: "mastered", label: "Mastered ≥80%" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                  filter === tab.id ? "bg-[var(--dashboard-primary)] text-white shadow-sm" : "text-[var(--dashboard-text-muted)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setActiveTab("progress")}
            className="hidden lg:inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: "var(--dashboard-primary)" }}
          >
            Full Analytics <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Grid Content */}
      {filteredReports.length === 0 ? (
        <div
          className="mt-6 rounded-xl border border-dashed p-8 text-center"
          style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>
            {activeReports.length === 0 ? "Solve questions to build your mastery matrix" : "No subjects match current filter"}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--dashboard-text-muted)" }}>
            {activeReports.length === 0 ? "Subject accuracy will appear automatically as you attempt questions." : "Try clearing your search query or switching filter tabs."}
          </p>
          {activeReports.length === 0 && (
            <button onClick={() => setActiveTab("practice")} className="command-primary-btn mt-4">
              Start Practice Session
            </button>
          )}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredReports.map((r) => {
            const pct = Math.round((r.correct / Math.max(1, r.attempted)) * 100);
            const isWeak = pct < 65;
            const isMastered = pct >= 80;

            const badgeBg = isWeak ? "var(--dashboard-danger-subtle)" : isMastered ? "var(--dashboard-success-subtle)" : "var(--dashboard-warning-subtle)";
            const badgeColor = isWeak ? "var(--dashboard-danger)" : isMastered ? "var(--dashboard-success)" : "var(--dashboard-warning)";

            return (
              <button
                key={r.name}
                onClick={() => onPractice(r.name)}
                className="group text-left rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-all duration-200 hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dashboard-focus-ring)]"
                style={{
                  background: isWeak ? "var(--dashboard-danger-subtle)" : "var(--dashboard-surface-muted)",
                  borderColor: isWeak ? "color-mix(in srgb, var(--dashboard-danger) 20%, var(--dashboard-border-muted))" : "var(--dashboard-border-muted)",
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 w-full">
                    <p className="text-[13px] font-bold leading-tight line-clamp-2" style={{ color: "var(--dashboard-text-primary)" }}>
                      {r.name}
                    </p>
                    <span
                      className="shrink-0 text-xs font-mono font-bold px-2 py-0.5 rounded-full border"
                      style={{ background: badgeBg, borderColor: "color-mix(in srgb, " + badgeColor + " 25%, transparent)", color: badgeColor }}
                    >
                      {pct}%
                    </span>
                  </div>

                  <p className="text-[11px] mt-1.5" style={{ color: "var(--dashboard-text-muted)" }}>
                    {r.attempted} attempted · {r.correct} correct
                  </p>
                </div>

                <div>
                  {/* Shimmer Progress Bar */}
                  <div className="h-1.5 rounded-full overflow-hidden flex w-full" style={{ background: "var(--dashboard-surface)" }} aria-hidden="true">
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${pct}%`,
                        background: isWeak ? "var(--dashboard-danger)" : isMastered ? "var(--dashboard-success)" : "var(--dashboard-warning)",
                      }}
                    />
                  </div>

                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold inline-flex items-center gap-1 group-hover:translate-x-1 transition-transform" style={{ color: "var(--dashboard-primary)" }}>
                      Practice Drill →
                    </span>
                    {isMastered && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--dashboard-success)]" />}
                    {isWeak && <AlertTriangle className="w-3.5 h-3.5 text-[var(--dashboard-danger)]" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Activity, TrendingUp, BarChart2, Layers } from "lucide-react";

type ActivityPoint = { date: string; answered: number; correct: number };
type MetricMode = "solved" | "accuracy";

export default function PerformanceCard({
  activity,
  results,
  range,
  onRangeChange,
  loading,
}: {
  activity: ActivityPoint[];
  results: { score: number }[];
  range: "7D" | "30D" | "ALL";
  onRangeChange: (r: "7D" | "30D" | "ALL") => void;
  loading?: boolean;
}) {
  const [metric, setMetric] = useState<MetricMode>("solved");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const points = activity;
  const totalSolved = useMemo(() => points.reduce((s, p) => s + p.answered, 0), [points]);
  const overallAccuracy = useMemo(() => {
    const tot = points.reduce((s, p) => s + p.answered, 0);
    const cor = points.reduce((s, p) => s + p.correct, 0);
    return tot ? Math.round((cor / tot) * 100) : 0;
  }, [points]);

  // Max scale calculation depending on active metric
  const maxVal = useMemo(() => {
    if (metric === "accuracy") return 100;
    return Math.max(1, ...points.map((p) => p.answered));
  }, [points, metric]);

  const W = 360;
  const H = 72;
  const pad = 8;
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;

  // Build SVG path points
  const coords = useMemo(() => {
    return points.map((p, i) => {
      const val = metric === "accuracy" ? (p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : 0) : p.answered;
      const x = pad + i * step;
      const y = H - pad - (val / maxVal) * (H - pad * 2);
      return { x, y, val, date: p.date, answered: p.answered, correct: p.correct };
    });
  }, [points, metric, maxVal, step]);

  const pathD = useMemo(() => {
    if (coords.length === 0) return "";
    return coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");
  }, [coords]);

  const areaD = useMemo(() => {
    if (coords.length === 0) return "";
    const lastX = coords[coords.length - 1].x;
    return `${pathD} L ${lastX} ${H - pad} L ${pad} ${H - pad} Z`;
  }, [coords, pathD]);

  const hoveredPoint = hoveredIdx !== null ? coords[hoveredIdx] : null;

  return (
    <div className="command-card p-5 sm:p-6 flex flex-col justify-between h-full">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="command-eyebrow flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5" /> Performance Velocity
          </p>
          <h3 className="font-display font-extrabold text-[16px] mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>
            Preparation Overview
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
            {totalSolved} questions solved · {overallAccuracy}% accuracy {loading ? "· Refreshing…" : ""}
          </p>
        </div>

        {/* Controls: Metric Switch + Range Selector */}
        <div className="flex items-center gap-2">
          {/* Solved vs Accuracy Toggle */}
          <div className="flex items-center rounded-lg border p-0.5" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
            <button
              onClick={() => setMetric("solved")}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${
                metric === "solved" ? "bg-[var(--dashboard-primary)] text-white shadow-sm" : "text-[var(--dashboard-text-muted)]"
              }`}
            >
              Solved
            </button>
            <button
              onClick={() => setMetric("accuracy")}
              className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${
                metric === "accuracy" ? "bg-[var(--dashboard-primary)] text-white shadow-sm" : "text-[var(--dashboard-text-muted)]"
              }`}
            >
              Accuracy %
            </button>
          </div>

          {/* Time Range Selector */}
          <div className="flex items-center rounded-full border p-1 gap-0.5" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
            {(["7D", "30D", "ALL"] as const).map((r) => (
              <button
                key={r}
                onClick={() => onRangeChange(r)}
                aria-pressed={range === r}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors"
                style={
                  range === r
                    ? { background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }
                    : { color: "var(--dashboard-text-muted)" }
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative mt-5 rounded-xl border p-4" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}>
        {coords.length === 0 ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--dashboard-text-muted)" }}>
            No activity points in selected window — start practicing to see performance curves.
          </p>
        ) : (
          <>
            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div
                className="absolute top-2 left-4 px-3 py-1.5 rounded-lg border text-xs font-mono shadow-md z-10 flex items-center gap-3 animate-in fade-in"
                style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }}
              >
                <span className="font-bold text-[var(--dashboard-primary)]">
                  {new Date(hoveredPoint.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
                <span>
                  {metric === "solved" ? `${hoveredPoint.val} questions` : `${hoveredPoint.val}% accuracy (${hoveredPoint.correct}/${hoveredPoint.answered})`}
                </span>
              </div>
            )}

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-[100px] overflow-visible"
              role="img"
              aria-label="Performance trend chart"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <defs>
                <linearGradient id="chartAreaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="var(--dashboard-primary)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--dashboard-primary)" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Area Under Curve */}
              <path d={areaD} fill="url(#chartAreaGrad)" />

              {/* Curve Stroke */}
              <path
                d={pathD}
                fill="none"
                stroke="var(--dashboard-primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Interactive Data Dots */}
              {coords.map((c, i) => (
                <g key={i} className="cursor-pointer" onMouseEnter={() => setHoveredIdx(i)}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={hoveredIdx === i ? 6 : 3.5}
                    fill={hoveredIdx === i ? "var(--dashboard-text-inverse)" : "var(--dashboard-primary)"}
                    stroke="var(--dashboard-primary)"
                    strokeWidth={hoveredIdx === i ? 3 : 1.5}
                    className="transition-all duration-150"
                  />
                </g>
              ))}
            </svg>

            <div className="flex justify-between text-[10px] font-mono font-semibold mt-2 border-t pt-1.5" style={{ color: "var(--dashboard-text-muted)", borderColor: "var(--dashboard-border-muted)" }}>
              {points.slice(-7).map((p, i) => (
                <span key={i} className="truncate">
                  {new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Summary KPI Badges */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border px-3 py-2 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>
            Total Solved
          </p>
          <p className="text-sm font-extrabold mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>
            {totalSolved}
          </p>
        </div>
        <div className="rounded-xl border px-3 py-2 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1" style={{ color: "var(--dashboard-text-muted)" }}>
            <TrendingUp className="w-3 h-3 text-[var(--dashboard-success)]" /> Accuracy Rate
          </p>
          <p className="text-sm font-extrabold mt-0.5" style={{ color: "var(--dashboard-success)" }}>
            {overallAccuracy}%
          </p>
        </div>
        <div className="rounded-xl border px-3 py-2 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1" style={{ color: "var(--dashboard-text-muted)" }}>
            <Activity className="w-3 h-3 text-[var(--dashboard-info)]" /> Last Score
          </p>
          <p className="text-sm font-extrabold mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>
            {results.length ? `${results[results.length - 1]?.score ?? 0}%` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

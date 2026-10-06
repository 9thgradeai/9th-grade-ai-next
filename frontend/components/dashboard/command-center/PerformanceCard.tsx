"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pulse, TrendUp, TrendDown, ChartBar, Timer, Lightning } from "@phosphor-icons/react";

type ActivityPoint = { date: string; answered: number; correct: number; durationSec?: number };
export type PerfRange = "7D" | "30D" | "90D" | "ALL";
type MetricMode = "solved" | "accuracy" | "time";

export const PERF_RANGES: PerfRange[] = ["7D", "30D", "90D", "ALL"];

type MetricTheme = { from: string; to: string; glow: string };

/* Token-driven metric accents (hex fallbacks for non-themed contexts).
   Dark gets luminous series, light gets deeper ones — see --viz-* tokens. */
const METRIC_THEMES: Record<MetricMode, MetricTheme> = {
  solved: { from: "var(--viz-violet, #8B5CF6)", to: "var(--viz-cyan, #22D3EE)", glow: "color-mix(in srgb, var(--viz-violet, #8B5CF6) 45%, transparent)" },
  accuracy: { from: "var(--viz-emerald, #10B981)", to: "var(--viz-lime, #A3E635)", glow: "color-mix(in srgb, var(--viz-emerald, #10B981) 45%, transparent)" },
  time: { from: "var(--viz-amber, #F59E0B)", to: "var(--viz-rose, #FB7185)", glow: "color-mix(in srgb, var(--viz-amber, #F59E0B) 45%, transparent)" },
};

function fmtTime(sec: number): string {
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtDeltaTime(sec: number): string {
  const sign = sec > 0 ? "+" : sec < 0 ? "−" : "";
  const abs = Math.abs(Math.round(sec / 60));
  return `${sign}${abs}m`;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Animated count-up toward `target` — instant when reduced motion is on. */
function useCountUp(target: number, reducedMotion: boolean, durationMs = 650): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (reducedMotion) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      fromRef.current = target;
    };
  }, [target, reducedMotion, durationMs]);
  return value;
}

/** Live session clock (HH:MM:SS) — the trading-hub heartbeat. */
function useSessionClock(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * Trading-hub performance overview. Every number is derived from the
 * server-provided activity window — count-ups, deltas and the ticker only
 * animate real values, never invented ones.
 */
export default function PerformanceCard({
  activity,
  results,
  range,
  onRangeChange,
  loading,
}: {
  activity: ActivityPoint[];
  results: { score: number }[];
  range: PerfRange;
  onRangeChange: (r: PerfRange) => void;
  loading?: boolean;
}) {
  const [metric, setMetric] = useState<MetricMode>("solved");
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  const dotRefs = useRef<(SVGGElement | null)[]>([]);
  const reducedMotion = usePrefersReducedMotion();
  const clock = useSessionClock();
  const theme = METRIC_THEMES[metric];

  const windowCount = range === "7D" ? 7 : range === "30D" ? 30 : range === "90D" ? 90 : activity.length;
  const points = useMemo(() => activity.slice(-windowCount), [activity, windowCount]);
  const prevPoints = useMemo(
    () => (range === "ALL" ? [] : activity.slice(-windowCount * 2, -windowCount)),
    [activity, windowCount, range],
  );

  const summarize = (list: ActivityPoint[]) => {
    const solved = list.reduce((s, p) => s + p.answered, 0);
    const correct = list.reduce((s, p) => s + p.correct, 0);
    const time = list.reduce((s, p) => s + (p.durationSec ?? 0), 0);
    return { solved, accuracy: solved ? Math.round((correct / solved) * 100) : 0, time };
  };

  const totals = useMemo(() => summarize(points), [points]);
  const prev = useMemo(() => summarize(prevPoints), [prevPoints]);
  const hasPrev = prevPoints.length > 0 && prevPoints.some((p) => p.answered > 0);

  const solvedDelta = totals.solved - prev.solved;
  const accDelta = totals.accuracy - prev.accuracy;
  const timeDelta = totals.time - prev.time;

  const animatedSolved = useCountUp(totals.solved, reducedMotion);
  const animatedAccuracy = useCountUp(totals.accuracy, reducedMotion);
  const animatedTime = useCountUp(totals.time, reducedMotion);

  const maxVal = useMemo(() => {
    if (metric === "accuracy") return 100;
    if (metric === "time") return Math.max(1, ...points.map((p) => p.durationSec ?? 0));
    return Math.max(1, ...points.map((p) => p.answered));
  }, [points, metric]);

  const W = 360;
  const H = 96;
  const pad = 10;
  const step = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;

  const coords = useMemo(() => {
    return points.map((p, i) => {
      const val =
        metric === "accuracy"
          ? p.answered > 0
            ? Math.round((p.correct / p.answered) * 100)
            : 0
          : metric === "time"
            ? (p.durationSec ?? 0)
            : p.answered;
      const x = pad + i * step;
      const y = H - pad - (val / maxVal) * (H - pad * 2);
      return { x, y, val, date: p.date, answered: p.answered, correct: p.correct, durationSec: p.durationSec ?? 0 };
    });
  }, [points, metric, maxVal, step]);

  const pathD = useMemo(() => {
    if (coords.length === 0) return "";
    return coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  }, [coords]);

  const areaD = useMemo(() => {
    if (coords.length === 0) return "";
    const lastX = coords[coords.length - 1].x;
    return `${pathD} L ${lastX.toFixed(1)} ${H - pad} L ${pad} ${H - pad} Z`;
  }, [coords, pathD]);

  const bestDay = useMemo(() => {
    let best = 0;
    for (const c of coords) {
      if (c.answered > 0) best = Math.max(best, Math.round((c.correct / c.answered) * 100));
    }
    return best;
  }, [coords]);

  // Ticker tape: last 7 real days, looped for a seamless marquee.
  const tape = useMemo(() => {
    const days = points.slice(-7).map((p) => ({
      date: new Date(p.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      answered: p.answered,
      acc: p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : 0,
    }));
    return [...days, ...days];
  }, [points]);

  const activeIdx = pinnedIdx ?? hoveredIdx;
  const hoveredPoint = activeIdx !== null ? coords[activeIdx] : null;

  const tooltipText = (p: (typeof coords)[number]) => {
    if (metric === "solved") return `${p.answered} ${p.answered === 1 ? "question" : "questions"}`;
    if (metric === "time") return `${fmtTime(p.durationSec)}`;
    return `${p.answered > 0 ? Math.round((p.correct / p.answered) * 100) : 0}% accuracy (${p.correct}/${p.answered})`;
  };

  const moveFocus = (dir: 1 | -1) => {
    if (activeIdx === null) {
      setPinnedIdx(0);
      dotRefs.current[0]?.focus();
      return;
    }
    const next = Math.max(0, Math.min(coords.length - 1, activeIdx + dir));
    setPinnedIdx(next);
    dotRefs.current[next]?.focus();
  };

  const metricLabel = metric === "time" ? "Study time" : metric === "accuracy" ? "Accuracy" : "Solved";
  const gradId = `perf-vel-grad-${metric}`;
  const animKey = `${metric}-${range}`;

  const DeltaPill = ({ value, format }: { value: number; format: (v: number) => string }) => {
    if (!hasPrev) return null;
    const up = value > 0;
    const flat = value === 0;
    return (
      <span
        className="perf-delta inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums"
        style={{
          color: flat ? "var(--dashboard-text-muted)" : up ? "var(--dashboard-success)" : "var(--dashboard-danger)",
          background: flat
            ? "var(--dashboard-surface-muted)"
            : up
              ? "var(--dashboard-success-subtle)"
              : "var(--dashboard-danger-subtle)",
        }}
        aria-label={flat ? "no change vs previous period" : `${format(value)} vs previous period`}
      >
        {!flat && (up ? <TrendUp className="h-3 w-3" aria-hidden="true" /> : <TrendDown className="h-3 w-3" aria-hidden="true" />)}
        {format(value)}
      </span>
    );
  };

  return (
    <div className="command-card perf-hub relative overflow-hidden p-5 sm:p-6 flex flex-col h-full">
      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="command-eyebrow flex items-center gap-1.5">
            <ChartBar className="w-3.5 h-3.5" /> Performance Velocity
            <span
              className="perf-live ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-extrabold tracking-widest"
              style={{ borderColor: "color-mix(in srgb, var(--dashboard-success) 40%, transparent)", color: "var(--dashboard-success)" }}
              aria-label="Live session tracking"
              title="Live session tracking"
            >
              <span className="perf-live-dot relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </span>
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums" style={{ color: "var(--dashboard-text-muted)" }}>
            {totals.solved} questions · {totals.accuracy}% accuracy · {fmtTime(totals.time)}
            <span className="mx-1.5 opacity-40">|</span>
            <span className="tabular-nums">{clock}</span>
            {loading ? " · Refreshing…" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div
            className="perf-metric-switch flex items-center rounded-xl border p-0.5"
            style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }}
            role="group"
            aria-label="Chart metric"
          >
            {(
              [
                ["solved", "Solved", Lightning] as const,
                ["accuracy", "Accuracy", TrendUp] as const,
                ["time", "Time", Timer] as const,
              ]
            ).map(([val, label, Icon]) => (
              <button
                key={val}
                onClick={() => setMetric(val)}
                aria-pressed={metric === val}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-bold rounded-lg transition-all min-h-[32px]"
                style={
                  metric === val
                    ? { background: `linear-gradient(135deg, ${METRIC_THEMES[val].from}, ${METRIC_THEMES[val].to})`, color: "#fff", boxShadow: `0 2px 12px ${METRIC_THEMES[val].glow}` }
                    : { color: "var(--dashboard-text-muted)" }
                }
              >
                <Icon className="w-3 h-3" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-full border p-1 gap-0.5" style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)" }} role="group" aria-label="Time range">
            {PERF_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => onRangeChange(r)}
                aria-pressed={range === r}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors min-h-[28px]"
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

      {/* ── KPI ticker tiles with animated count-ups + period deltas ── */}
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <div className="perf-kpi rounded-xl border px-3 py-2.5 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", borderTop: `2px solid ${METRIC_THEMES.solved.from}` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>
            Total Solved
          </p>
          <p className="font-mono text-lg font-extrabold tabular-nums" style={{ color: METRIC_THEMES.solved.from }}>
            {Math.round(animatedSolved).toLocaleString()}
          </p>
          <DeltaPill value={solvedDelta} format={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`} />
        </div>
        <div className="perf-kpi rounded-xl border px-3 py-2.5 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", borderTop: `2px solid ${METRIC_THEMES.accuracy.from}` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>
            Accuracy
          </p>
          <p className="font-mono text-lg font-extrabold tabular-nums" style={{ color: METRIC_THEMES.accuracy.from }}>
            {Math.round(animatedAccuracy)}%
          </p>
          <DeltaPill value={accDelta} format={(v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}pp`} />
        </div>
        <div className="perf-kpi rounded-xl border px-3 py-2.5 text-center" style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-muted)", borderTop: `2px solid ${METRIC_THEMES.time.from}` }}>
          <p className="text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1" style={{ color: "var(--dashboard-text-muted)" }}>
            <Pulse className="w-3 h-3" aria-hidden="true" /> {metric === "accuracy" ? "Best Day" : metric === "time" ? "Time" : "Last Score"}
          </p>
          <p className="font-mono text-lg font-extrabold tabular-nums" style={{ color: METRIC_THEMES.time.from }}>
            {metric === "time"
              ? fmtTime(Math.round(animatedTime))
              : metric === "accuracy"
                ? `${bestDay}%`
                : results.length
                  ? `${results[results.length - 1]?.score ?? 0}%`
                  : "—"}
          </p>
          {metric === "time" ? (
            <DeltaPill value={timeDelta} format={fmtDeltaTime} />
          ) : (
            <span className="font-mono text-[10px]" style={{ color: "var(--dashboard-text-muted)" }}>
              {metric === "accuracy" ? "peak" : fmtTime(Math.round(animatedTime))}
            </span>
          )}
        </div>
      </div>

      {/* ── Neon chart terminal ── */}
      <div className="perf-terminal relative mt-3 rounded-xl border p-4" style={{ borderColor: "var(--dashboard-border-muted)", background: "color-mix(in srgb, var(--dashboard-surface-muted) 60%, transparent)" }}>
        {coords.length === 0 || points.every((p) => p.answered === 0 && metric !== "time") ? (
          <p className="text-sm py-8 text-center" style={{ color: "var(--dashboard-text-muted)" }}>
            No activity points in the selected window — start practicing to see performance curves.
          </p>
        ) : (
          <>
            {hoveredPoint && (
              <div
                className="absolute top-2 left-4 px-3 py-1.5 rounded-lg border text-xs font-mono shadow-md z-10 flex items-center gap-3"
                style={{ background: "var(--dashboard-surface)", borderColor: "var(--dashboard-border-strong)", color: "var(--dashboard-text-primary)" }}
              >
                <span className="font-bold" style={{ color: theme.from }}>
                  {new Date(hoveredPoint.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </span>
                <span>{metricLabel}: {tooltipText(hoveredPoint)}</span>
              </div>
            )}

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-[110px] overflow-visible"
              role="img"
              aria-label={`${metricLabel} trend over the last ${range}`}
              onMouseLeave={() => { if (pinnedIdx === null) setHoveredIdx(null); }}
              onClick={(e) => { if (e.target === e.currentTarget) setPinnedIdx(null); }}
            >
              <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={theme.from} />
                  <stop offset="100%" stopColor={theme.to} />
                </linearGradient>
                <linearGradient id={`${gradId}-area`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={theme.from} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={theme.to} stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75].map((f) => (
                <line
                  key={f}
                  x1={pad}
                  x2={W - pad}
                  y1={pad + (H - pad * 2) * f}
                  y2={pad + (H - pad * 2) * f}
                  stroke="var(--dashboard-border-muted)"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  opacity="0.7"
                />
              ))}

              <path key={`area-${animKey}`} d={areaD} fill={`url(#${gradId}-area)`} className="perf-area-in" />

              <path
                key={`line-${animKey}`}
                d={pathD}
                fill="none"
                stroke={`url(#${gradId})`}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={100}
                className="perf-line-draw"
                style={{ filter: `drop-shadow(0 0 6px ${theme.glow})` }}
              />

              {coords.map((c, i) => {
                const isLast = i === coords.length - 1;
                return (
                  <g
                    key={c.date}
                    ref={(el) => {
                      dotRefs.current[i] = el;
                    }}
                    className="cursor-pointer focus:outline-none"
                    role="button"
                    tabIndex={0}
                    aria-label={`${new Date(c.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}: ${tooltipText(c)}${pinnedIdx === i ? " (pinned)" : ""}`}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onFocus={() => { setHoveredIdx(i); setPinnedIdx(i); }}
                    onClick={() => setPinnedIdx(pinnedIdx === i ? null : i)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setPinnedIdx(null);
                        setHoveredIdx(null);
                      } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        moveFocus(1);
                      } else if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        moveFocus(-1);
                      }
                    }}
                  >
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={activeIdx === i ? 6 : isLast ? 4.5 : 3}
                      fill={activeIdx === i ? "#fff" : theme.from}
                      stroke={activeIdx === i ? theme.from : theme.to}
                      strokeWidth={activeIdx === i ? 3 : 1.5}
                      style={{ outline: activeIdx === i ? `2px solid var(--dashboard-focus-ring)` : undefined }}
                    />
                    {isLast && !reducedMotion && (
                      <circle cx={c.x} cy={c.y} r={4.5} fill="none" stroke={theme.to} strokeWidth="1.5" className="perf-last-ping" />
                    )}
                  </g>
                );
              })}
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

      {/* ── Ticker tape: last 7 real days, trading-hub marquee ── */}
      {tape.length > 0 && (
        <div
          className="perf-tape relative mt-3 overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface)" }}
          aria-label="Recent daily performance tape"
        >
          <div className="perf-tape-track flex w-max items-center gap-2 px-2 py-1.5">
            {tape.map((d, i) => (
              <span
                key={i}
                aria-hidden={i >= tape.length / 2}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] tabular-nums"
                style={{
                  background: "var(--dashboard-surface-muted)",
                  color: "var(--dashboard-text-secondary)",
                }}
              >
                <span className="font-bold uppercase" style={{ color: "var(--dashboard-text-primary)" }}>{d.date}</span>
                <span>{d.answered}q</span>
                <span className="font-bold" style={{ color: d.acc >= 70 ? "var(--dashboard-success)" : d.acc >= 40 ? "var(--dashboard-warning)" : "var(--dashboard-danger)" }}>
                  {d.acc}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

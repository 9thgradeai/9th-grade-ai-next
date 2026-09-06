"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { TrendingUp, Flame, Target, Trophy, Info, X, ShieldCheck, Sparkles } from "lucide-react";

type Props = {
  score: number;
  accuracy: number;
  streak: number;
  solved: number;
  rank: number | null;
  delta?: number;
};

export default function PreparationScoreCard({ score, accuracy, streak, solved, rank, delta = 6.4 }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const circ = 2 * Math.PI * 52;
  const clampedScore = Math.max(0, Math.min(100, score));
  const offset = circ * (1 - clampedScore / 100);

  const readinessStatus =
    clampedScore >= 80 ? "BCS Elite Ready" : clampedScore >= 60 ? "Solid Progress" : clampedScore >= 35 ? "Building Foundation" : "Warmup Phase";

  const readinessColor =
    clampedScore >= 80 ? "var(--dashboard-success)" : clampedScore >= 60 ? "var(--dashboard-primary)" : clampedScore >= 35 ? "var(--dashboard-warning)" : "var(--dashboard-danger)";

  return (
    <div className="command-card command-card--hero relative overflow-hidden flex flex-col justify-between h-full">
      <div className="command-aurora opacity-70" aria-hidden="true" />
      <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full blur-3xl opacity-[0.12]" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" />

      {/* Header */}
      <div className="relative flex items-center justify-between gap-2">
        <div>
          <p className="command-eyebrow flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> Preparation Readiness Engine
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--dashboard-text-muted)" }}>
            Real-time algorithmic confidence score
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border flex items-center gap-1"
            style={{
              background: "var(--dashboard-surface-muted)",
              borderColor: "var(--dashboard-border-muted)",
              color: readinessColor,
            }}
          >
            <Sparkles className="w-3 h-3" />
            {readinessStatus}
          </span>
          <button
            onClick={() => setShowBreakdown((p) => !p)}
            className="w-7 h-7 rounded-lg border flex items-center justify-center transition-colors hover:border-[var(--dashboard-primary)] hover:text-[var(--dashboard-primary)]"
            style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}
            aria-label="View score breakdown formula"
            title="Score formula breakdown"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Gauge + Metrics */}
      <div className="relative mt-5 flex flex-col sm:flex-row sm:items-center gap-6">
        {/* Animated Radial Ring */}
        <div className="relative w-[140px] h-[140px] shrink-0 mx-auto sm:mx-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90 filter drop-shadow-[0_0_12px_rgba(129,140,248,0.25)]">
            <defs>
              <linearGradient id="scoreGaugeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--dashboard-primary)" />
                <stop offset="100%" stopColor="var(--dashboard-info)" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r={52} fill="none" stroke="var(--dashboard-border-muted)" strokeWidth="10" />
            <motion.circle
              cx="60"
              cy="60"
              r={52}
              fill="none"
              stroke="url(#scoreGaugeGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circ}
              initial={{ strokeDashoffset: circ }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display font-black text-[34px] leading-none tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              {clampedScore}
              <span className="text-[18px] font-bold opacity-60">%</span>
            </span>
            <span
              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
              style={{
                background: "var(--dashboard-success-subtle)",
                color: "var(--dashboard-success)",
                borderColor: "color-mix(in srgb, var(--dashboard-success) 18%, transparent)",
              }}
            >
              <TrendingUp className="w-3 h-3" /> +{delta.toFixed(1)}% wk
            </span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Accuracy", value: `${accuracy}%`, icon: Target, color: "var(--dashboard-info)" },
              { label: "Streak", value: `${streak}d`, icon: Flame, color: "var(--dashboard-warning)" },
              { label: "Solved", value: solved.toLocaleString("en-US"), icon: Trophy, color: "var(--dashboard-primary)" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border p-2.5 text-center transition-all hover:border-[var(--dashboard-primary)]/40 hover:-translate-y-0.5"
                style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}
              >
                <m.icon className="w-4 h-4 mx-auto mb-1" style={{ color: m.color }} />
                <p className="text-[10px] font-extrabold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>
                  {m.label}
                </p>
                <p className="text-sm font-bold mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>
                  {m.value}
                </p>
              </div>
            ))}
          </div>

          {/* Rank & Progress Line */}
          <div className="pt-1">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>
                {rank != null && rank > 0 ? (
                  <>
                    Rank <span className="font-bold font-mono" style={{ color: "var(--dashboard-text-primary)" }}>#{rank}</span> overall
                  </>
                ) : (
                  "Competitive Readiness Target"
                )}
              </span>
              <span className="font-mono text-[11px] font-bold" style={{ color: "var(--dashboard-primary)" }}>
                {clampedScore}/100
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "var(--dashboard-surface-muted)" }} aria-hidden="true">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, var(--dashboard-primary), var(--dashboard-info))" }}
                initial={{ width: 0 }}
                animate={{ width: `${clampedScore}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Score Formula Breakdown Modal */}
      <AnimatePresence>
        {showBreakdown && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t overflow-hidden"
            style={{ borderColor: "var(--dashboard-border-muted)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--dashboard-text-primary)" }}>
                Calculated Score Breakdown
              </p>
              <button onClick={() => setShowBreakdown(false)} className="text-[var(--dashboard-text-muted)] hover:text-[var(--dashboard-text-primary)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-lg border p-2 text-center" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
                <p className="font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>Accuracy (55%)</p>
                <p className="text-xs font-mono font-bold mt-0.5" style={{ color: "var(--dashboard-info)" }}>{Math.round(accuracy * 0.55)} pts</p>
              </div>
              <div className="rounded-lg border p-2 text-center" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
                <p className="font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>Completion (35%)</p>
                <p className="text-xs font-mono font-bold mt-0.5" style={{ color: "var(--dashboard-primary)" }}>{Math.round(Math.min(100, (solved / 500) * 100) * 0.35)} pts</p>
              </div>
              <div className="rounded-lg border p-2 text-center" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
                <p className="font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>Streak (10%)</p>
                <p className="text-xs font-mono font-bold mt-0.5" style={{ color: "var(--dashboard-warning)" }}>{Math.min(10, Math.round(streak * 1.5))} pts</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

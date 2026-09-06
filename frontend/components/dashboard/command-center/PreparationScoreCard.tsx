"use client";
import { motion } from "framer-motion";
import { TrendingUp, Flame, Target, Trophy } from "lucide-react";

type Props = {
  score: number;
  accuracy: number;
  streak: number;
  solved: number;
  rank: number | null;
  delta?: number;
};

export default function PreparationScoreCard({ score, accuracy, streak, solved, rank, delta = 6.4 }: Props) {
  const circ = 2 * Math.PI * 52;
  const offset = circ * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <div className="command-card command-card--hero relative overflow-hidden flex flex-col">
      <div className="command-aurora opacity-60" aria-hidden="true" />
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full blur-3xl opacity-[0.07]" style={{ background: "var(--dashboard-primary)" }} aria-hidden="true" />
      <div className="relative">
        <p className="command-eyebrow">Preparation Score</p>
        <p className="text-[11px] mt-1" style={{ color: "var(--dashboard-text-muted)" }}>Overall readiness · updates after each session</p>
      </div>

      <div className="relative mt-6 flex items-center gap-6">
        <div className="relative w-[132px] h-[132px] shrink-0">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle cx="60" cy="60" r={52} fill="none" stroke="var(--dashboard-border-muted)" strokeWidth="10" />
            <motion.circle
              cx="60" cy="60" r={52} fill="none" stroke="var(--dashboard-primary)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circ} initial={{ strokeDashoffset: circ }} animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-extrabold text-[32px] leading-none tracking-tight" style={{ color: "var(--dashboard-text-primary)" }}>{score}<span className="text-[18px] font-bold opacity-60">%</span></span>
            <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: "var(--dashboard-success-subtle)", color: "var(--dashboard-success)" }}>
              <TrendingUp className="w-3 h-3" /> +{delta.toFixed(1)}% this week
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Accuracy", value: `${accuracy}%`, icon: Target },
              { label: "Streak", value: `${streak} days`, icon: Flame },
              { label: "Solved", value: solved.toLocaleString("en-US"), icon: Trophy },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border px-3 py-3 text-center" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
                <m.icon className="w-4 h-4 mx-auto mb-1" style={{ color: "var(--dashboard-text-muted)" }} />
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--dashboard-text-muted)" }}>{m.label}</p>
                <p className="text-sm font-bold mt-0.5" style={{ color: "var(--dashboard-text-primary)" }}>{m.value}</p>
              </div>
            ))}
          </div>
          {rank != null && rank > 0 && (
            <p className="text-xs" style={{ color: "var(--dashboard-text-muted)" }}>Rank <span className="font-bold" style={{ color: "var(--dashboard-text-primary)" }}>#{rank}</span> · keep solving to climb</p>
          )}
          <div className="h-1.5 rounded-full overflow-hidden flex" style={{ background: "var(--dashboard-surface-muted)" }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, score)}%`, background: "var(--dashboard-primary)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

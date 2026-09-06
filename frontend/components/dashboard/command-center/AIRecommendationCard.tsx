"use client";

import { Sparkles, ArrowRight, AlertTriangle, MessageSquare, CheckCircle2 } from "lucide-react";

type Props = {
  weakestName: string | null;
  weakestScore: number | null;
  weakestAttempts: number | null;
  pendingMistakes: number;
  onStartFocus: () => void;
  onBrowse: () => void;
  onAskCoach?: () => void;
};

export default function AIRecommendationCard({
  weakestName,
  weakestScore,
  weakestAttempts,
  pendingMistakes,
  onStartFocus,
  onBrowse,
  onAskCoach,
}: Props) {
  const hasWeak = !!weakestName && weakestScore != null && weakestScore < 75;

  return (
    <div className="command-card command-card--glow command-card--hero flex flex-col justify-between overflow-hidden h-full">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--dashboard-primary), var(--dashboard-info), transparent)" }} aria-hidden="true" />

      <div>
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm" style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}>
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          </span>
          <p className="command-eyebrow !text-[10px]">AI Neural Recommendation</p>
          <span className="ml-auto text-[10px] font-bold tracking-widest uppercase px-2.5 py-1 rounded-full border flex items-center gap-1.5" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)", background: "var(--dashboard-surface-muted)" }}>
            <span className="w-1.5 h-1.5 rounded-full status-dot-pulse" style={{ background: "var(--dashboard-success)" }} />
            Active Sync
          </span>
        </div>

        {hasWeak ? (
          <>
            <h3 className="mt-4 font-display font-extrabold text-[18px] leading-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              Weakest area identified: <span style={{ color: "var(--dashboard-primary)" }}>{weakestName}</span>
            </h3>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--dashboard-text-muted)" }}>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold" style={{ background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 20%, transparent)" }}>
                <AlertTriangle className="w-3.5 h-3.5" /> {weakestScore}% accuracy
              </span>
              <span>· {weakestAttempts} attempted</span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border" style={{ background: "var(--dashboard-success-subtle)", color: "var(--dashboard-success)", borderColor: "color-mix(in srgb, var(--dashboard-success) 20%, transparent)" }}>
                +4.5% readiness boost forecast
              </span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              Solving a 15-question targeted set here will bridge your major knowledge gap before your upcoming exam sprint.
            </p>
          </>
        ) : pendingMistakes > 0 ? (
          <>
            <h3 className="mt-4 font-display font-extrabold text-[18px] leading-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              You have <span style={{ color: "var(--dashboard-warning)" }}>{pendingMistakes} unresolved mistakes</span>
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              Reviewing wrong answers provides 3x higher retention than new questions. Tackle them in SRS Notebook mode.
            </p>
          </>
        ) : (
          <>
            <h3 className="mt-4 font-display font-extrabold text-[18px] leading-tight flex items-center gap-2" style={{ color: "var(--dashboard-text-primary)" }}>
              <CheckCircle2 className="w-5 h-5 text-[var(--dashboard-success)]" /> Mastered primary syllabus areas
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              No critical weak points found. Maintain peak momentum with mixed mock exams and timed speed drills.
            </p>
          </>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex gap-2">
          <button onClick={onStartFocus} className="command-primary-btn flex-1">
            {hasWeak ? "Start Focused Drill" : pendingMistakes > 0 ? "Review Mistakes Now" : "Launch Mixed Mock"} <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={onBrowse} className="command-secondary-btn">
            Browse
          </button>
        </div>

        {onAskCoach && (
          <button
            onClick={onAskCoach}
            className="w-full inline-flex items-center justify-center gap-2 text-xs font-semibold py-2 rounded-xl border transition-colors hover:border-[var(--dashboard-primary)]"
            style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-primary)" }}
          >
            <MessageSquare className="w-3.5 h-3.5" /> Ask AI Tutor to Explain Weak Spots
          </button>
        )}
      </div>

      <p className="mt-3 text-[11px] flex items-center justify-between" style={{ color: "var(--dashboard-text-muted)" }}>
        <span>Powered by student performance matrix</span>
        <span className="font-mono text-[10px]">v0.4.0 AI-Engine</span>
      </p>
    </div>
  );
}

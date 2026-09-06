"use client";
import { Sparkles, ArrowRight, AlertTriangle } from "lucide-react";
import { useDashboardStore } from "@/lib/store-ctx/dashboard";

type Props = {
  weakestName: string | null;
  weakestScore: number | null;
  weakestAttempts: number | null;
  pendingMistakes: number;
};

export default function AIRecommendationCard({ weakestName, weakestScore, weakestAttempts, pendingMistakes }: Props) {
  const { setActiveTab } = useDashboardStore();
  const hasWeak = !!weakestName && weakestScore != null && weakestScore < 75;
  return (
    <div className="command-card command-card--glow command-card--hero flex flex-col justify-between overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-[2px]" style={{ background: "linear-gradient(90deg, var(--dashboard-primary), transparent)" }} aria-hidden="true" />
      <div>
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}>
            <Sparkles className="w-3.5 h-3.5" />
          </span>
          <p className="command-eyebrow !text-[10px]">AI Recommendation</p>
          <span className="ml-auto text-[10px] font-bold tracking-widest uppercase px-2 py-1 rounded-full border" style={{ borderColor: "var(--dashboard-border-muted)", color: "var(--dashboard-text-muted)", background: "var(--dashboard-surface-muted)" }}>Live</span>
        </div>

        {hasWeak ? (
          <>
            <h3 className="mt-4 font-display font-bold text-[18px] leading-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              Your weakest area right now is <span style={{ color: "var(--dashboard-primary)" }}>{weakestName}</span>
            </h3>
            <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: "var(--dashboard-text-muted)" }}>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold" style={{ background: "var(--dashboard-danger-subtle)", color: "var(--dashboard-danger)", borderColor: "color-mix(in srgb, var(--dashboard-danger) 18%, transparent)" }}>
                <AlertTriangle className="w-3 h-3" /> {weakestScore}% accuracy
              </span>
              <span>· {weakestAttempts} attempted</span>
            </div>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
              Focus 20 questions here and your overall score can jump <span className="font-semibold" style={{ color: "var(--dashboard-text-primary)" }}>+4–6%</span>. Your streak benefits most from fixing this first.
            </p>
          </>
        ) : pendingMistakes > 0 ? (
          <>
            <h3 className="mt-4 font-display font-bold text-[18px] leading-tight" style={{ color: "var(--dashboard-text-primary)" }}>
              You have <span style={{ color: "var(--dashboard-primary)" }}>{pendingMistakes} unresolved mistakes</span>
            </h3>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>Reviewing them now is the fastest way to improve accuracy. Each correction strengthens retention.</p>
          </>
        ) : (
          <>
            <h3 className="mt-4 font-display font-bold text-[18px] leading-tight" style={{ color: "var(--dashboard-text-primary)" }}>You&apos;re in great shape — keep the momentum</h3>
            <p className="mt-3 text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>No critical weak area detected. Start a mixed practice to stay sharp before your next exam.</p>
          </>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <button onClick={() => setActiveTab(hasWeak || pendingMistakes > 0 ? "mistakes" : "practice")} className="command-primary-btn flex-1">
          {hasWeak ? "Start Focus Session" : pendingMistakes > 0 ? "Review Mistakes" : "Start Practice"} <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => setActiveTab("practice")} className="command-secondary-btn">Browse Practice</button>
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--dashboard-text-muted)" }}>Powered by your real attempt history · updates in real time</p>
    </div>
  );
}

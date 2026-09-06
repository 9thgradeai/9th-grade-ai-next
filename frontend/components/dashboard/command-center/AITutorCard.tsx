"use client";

import { Sparkles, MessageCircle, ArrowRight, Bot } from "lucide-react";

type Props = { weakestName: string | null; onAsk: () => void; onGuided: () => void };

export default function AITutorCard({ weakestName, onAsk, onGuided }: Props) {
  return (
    <div className="command-card command-card--glow p-5 sm:p-6 flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shadow-sm"
              style={{ background: "var(--dashboard-primary)", color: "var(--dashboard-text-inverse)" }}
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            </span>
            <p className="command-eyebrow !text-[10px]">Interactive AI Tutor</p>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--dashboard-text-muted)]">
            <span className="w-2 h-2 rounded-full status-dot-pulse" style={{ background: "var(--dashboard-success)" }} aria-hidden="true" />
            Ready
          </div>
        </div>

        <div className="mt-4 rounded-xl border p-4" style={{ background: "var(--dashboard-surface-muted)", borderColor: "var(--dashboard-border-muted)" }}>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--dashboard-text-secondary)" }}>
            {weakestName ? (
              <>
                I&apos;ve detected sub-optimal accuracy in <span className="font-bold text-[var(--dashboard-primary)]">{weakestName}</span>. Let&apos;s run a 5-minute interactive guided tutor session to solidify core concepts.
              </>
            ) : (
              <>
                Ask me any question in Bengali or English — Constitution, Math tricks, English grammar, or BCS written strategy.
              </>
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <div className="flex gap-2">
          <button onClick={onAsk} className="command-primary-btn flex-1">
            <MessageCircle className="w-4 h-4" /> Ask AI Tutor
          </button>
          <button onClick={onGuided} className="command-secondary-btn">
            Guided Lesson <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] font-mono text-[var(--dashboard-text-muted)]">
          Private session · Context-aware tutoring engine
        </p>
      </div>
    </div>
  );
}

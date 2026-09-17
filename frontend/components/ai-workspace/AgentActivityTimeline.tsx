"use client";

// Live activity canvas for the AI coach. While an agent turn runs, every real
// tool the loop invokes streams in here as an animated step (spinner → done /
// fail). Completed runs persist the same log into the assistant message so the
// timeline survives a reload.
//
// The visual language leans on the Ninth-Signal Aurora tokens (`.text-aurora-iris`)
// so the coach reads as distinct from the tutor/assistant modes — but the rows
// themselves never fake motion: a step spins only while it is actually running.

import { CheckCircle2, CircleX, Loader2, Sparkles } from "lucide-react";
import type { AgentActivityStepDto } from "./types";

type AgentActivityTimelineProps = {
  tools: AgentActivityStepDto[];
  className?: string;
};

export default function AgentActivityTimeline({ tools, className }: AgentActivityTimelineProps) {
  if (!tools || tools.length === 0) return null;

  return (
    <div
      className={`mt-2.5 overflow-hidden rounded-xl border border-[var(--dashboard-border-muted)] ${className ?? ""}`}
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)]/60 px-3 py-1.5">
        <Sparkles className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        <span className="text-aurora-iris font-mono text-[10px] font-bold tracking-[0.18em] uppercase">
          Coach tool steps
        </span>
        <span className="ml-auto font-mono text-[9px] tracking-[0.12em] text-[var(--dashboard-text-muted)]">
          live
        </span>
      </div>
      <ol
        className="divide-y divide-[var(--dashboard-border-muted)]/60 bg-[var(--dashboard-surface-muted)]/30"
        role="list"
        aria-label="AI coach tool activity"
      >
        {tools.map((t) => {
          const running = t.ok === undefined;
          const failed = t.ok === false;
          return (
            <li key={t.name} className="flex items-center gap-2.5 px-3 py-2">
              <span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center">
                {running && (
                  <span
                    className="absolute inline-flex h-4 w-4 animate-ping rounded-full opacity-40"
                    style={{ background: "var(--dashboard-primary)" }}
                    aria-hidden="true"
                  />
                )}
                {running ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin text-[var(--dashboard-primary)]"
                    aria-hidden="true"
                  />
                ) : failed ? (
                  <CircleX className="h-3.5 w-3.5 text-[var(--dashboard-danger)]" aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-[var(--dashboard-success)]"
                    aria-hidden="true"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--dashboard-text-secondary)]">
                {t.label}
              </span>
              {running && (
                <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-[var(--dashboard-text-muted)]">
                  working…
                </span>
              )}
              {failed && (
                <span className="shrink-0 font-mono text-[10px] tracking-[0.12em] text-[var(--dashboard-danger)]">
                  failed
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
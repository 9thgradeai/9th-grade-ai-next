"use client";

/**
 * PracticeStartDock
 * ─────────────────────────────────────────────────────────────────────────────
 * One-handed start dock for the quick-practice config phase. It sticks to the
 * bottom of the scroll viewport (above the mobile bottom nav, safe-area aware)
 * so the live total + time + start button are ALWAYS reachable — no scrolling
 * to start the exam on any device.
 *
 *   Mobile  (<lg): compact two-row dock — stats row (questions + time stepper),
 *             then a full-width thumb-sized start button.
 *   Desktop (lg+): single-row dock — stats left, start button right.
 */

import { Minus, Play, Plus, Timer } from "@phosphor-icons/react";

type Props = {
  totalCount: number;
  availableTotal: number;
  insufficient: boolean;
  durationMin: number;
  durationTouched: boolean;
  /** e.g. "(অটো: ২০×৩০সে = ১০ মিনিট)" — countdown of the auto estimate line. */
  autoCaption: string;
  selectedCount: number;
  loading: boolean;
  onAdjustDuration: (delta: number) => void;
  onStart: () => void;
};

export default function PracticeStartDock({
  totalCount,
  availableTotal,
  insufficient,
  durationMin,
  durationTouched,
  autoCaption,
  selectedCount,
  loading,
  onAdjustDuration,
  onStart,
}: Props) {
  const canStart = selectedCount > 0 && totalCount > 0 && !loading;
  return (
    <div
      data-testid="practice-start-dock"
      className="sticky z-[var(--z-sticky)] bottom-[calc(var(--bottom-nav-h)+12px+env(safe-area-inset-bottom))] lg:bottom-4"
    >
      <div className="glass-card rounded-2xl border border-[var(--accent)]/30 shadow-neon-glow overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3 sm:p-4">
          {/* Stats: questions + time stepper */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--dashboard-text-muted)]">
                মোট প্রশ্ন
              </p>
              <p className="leading-none">
                <span
                  data-testid="dock-total"
                  className={`text-2xl font-bold font-mono tabular-nums ${
                    totalCount > 0 ? "text-[var(--dashboard-primary)]" : "text-[var(--dashboard-text-secondary)]"
                  }`}
                >
                  {totalCount}
                </span>{" "}
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    insufficient ? "text-[var(--dashboard-danger)]" : "text-[var(--dashboard-text-muted)]"
                  }`}
                >
                  / {availableTotal} উপলব্ধ
                </span>
              </p>
            </div>

            <div className="w-px self-stretch bg-[var(--dashboard-border-muted)]" aria-hidden="true" />

            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--dashboard-text-muted)] flex items-center gap-1">
                <Timer className="w-3 h-3" aria-hidden="true" /> সময়
                {!durationTouched && totalCount > 0 && (
                  <span className="normal-case tracking-normal">· অটো</span>
                )}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <button
                  type="button"
                  onClick={() => onAdjustDuration(-1)}
                  aria-label="সময় কমান"
                  className="w-11 h-11 min-w-[44px] rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40 active:scale-95 transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span
                  data-testid="dock-duration"
                  className="text-xl font-bold text-[var(--dashboard-primary)] font-mono tabular-nums min-w-[2ch] text-center"
                >
                  {durationMin}
                </span>
                <button
                  type="button"
                  onClick={() => onAdjustDuration(1)}
                  aria-label="সময় বাড়ান"
                  className="w-11 h-11 min-w-[44px] rounded-lg bg-[var(--surface-raised)] border border-[var(--primary)]/20 flex items-center justify-center text-[var(--dashboard-primary)] hover:border-[var(--primary)]/40 active:scale-95 transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <span className="text-[10px] text-[var(--dashboard-text-muted)] font-mono hidden sm:inline">
                  মিনিট{autoCaption}
                </span>
              </div>
            </div>
          </div>

          {/* Start — thumb-sized, always in reach */}
          <button
            type="button"
            data-testid="dock-start"
            onClick={onStart}
            disabled={!canStart}
            className="w-full lg:w-auto lg:min-w-56 min-h-12 px-6 py-3 bg-[var(--accent)] text-[var(--dashboard-text-inverse)] font-mono text-sm font-bold rounded-xl hover:bg-[var(--accent-hover)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-neon-glow disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            <Play className="w-4 h-4" weight="fill" aria-hidden="true" />
            {loading ? "লোড হচ্ছে..." : `প্র্যাকটিস শুরু${totalCount > 0 ? ` · ${totalCount}টি` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

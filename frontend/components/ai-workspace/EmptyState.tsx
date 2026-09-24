"use client";

// Discovery state for a fresh conversation: the mode's identity tile, honest
// capability line, an optional inbound context chip (e.g. launched from the
// Solver with a topic/question), and start-er prompt chips.
//
// When the personalized opening is available (non-empty conversation start),
// it is layered above the mode identity: a time-of-day greeting, an honest
// summary of the learner's real progress, deterministic insights, and
// data-backed starter prompts. Everything here is deterministic app data —
// no LLM is involved.

import { FileText, PushPin } from "@phosphor-icons/react";
import AiLogo from "@/components/ui/AiLogo";
import { PRESET_PROMPTS } from "@/lib/data/ai";
import { modeMeta } from "./modes";
import { QUICK_PROMPTS } from "./prompts";
import type { Mode } from "./modes";
import type { AIOpeningDto } from "@/lib/types";

type EmptyStateProps = {
  mode: Mode;
  contextChip: string | null;
  /** Personalized opening from /api/ai/opening (null when unavailable). */
  opening: AIOpeningDto | null;
  onPrompt: (prompt: string) => void;
};

export default function EmptyState({ mode, contextChip, opening, onPrompt }: EmptyStateProps) {
  const meta = modeMeta(mode);

  // The opening is only for a fresh conversation; when the user has real
  // history it is personalized, otherwise it pairs with the mode identity.

  const prompts =
    mode === "tutor"
      ? PRESET_PROMPTS.map((p) => ({ id: p.id, labelBn: p.label.bn, prompt: p.label.bn }))
      : QUICK_PROMPTS.filter((q) => q.category === mode).map((q) => ({
          id: q.labelBn,
          labelBn: q.labelBn,
          prompt: q.prompt,
        }));

  const starterPrompts =
    opening && opening.suggestedPrompts.length > 0
      ? opening.suggestedPrompts.map((p) => ({ id: p.id, labelBn: p.labelBn, prompt: p.prompt }))
      : prompts;

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-4 py-6">
      <div className="flex w-full max-w-xl flex-col items-center text-center">
        {opening ? (
          <>
            <h2 className="font-mono text-lg tracking-tight text-[var(--text-primary)]">
              {opening.greeting}
            </h2>
            {opening.summary.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {opening.summary.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
            {opening.insights.length > 0 && (
              <div className="mt-4 flex flex-col gap-1.5">
                {opening.insights.map((ins) => (
                  <div
                    key={ins.id}
                    className="flex max-w-full items-center gap-2 rounded-lg border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] px-3 py-1.5 text-left text-xs text-[var(--dashboard-text-secondary)]"
                  >
                    <AiLogo
                      solid={false}
                      className={`h-3.5 w-3.5 flex-shrink-0 ${
                        ins.priority === "high"
                          ? "text-[var(--dashboard-danger)]"
                          : "text-[var(--dashboard-primary)]"
                      }`}
                    />
                    <span className="min-w-0 flex-1">{ins.text}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="ai-avatar h-14 w-14" aria-hidden="true">
              <meta.icon className="h-6 w-6 text-[var(--ai-accent)]" />
            </div>
            <h2 className="mt-3 font-mono text-lg tracking-tight text-[var(--text-primary)]">
              {`${meta.labelBn} · ${meta.labelEn.toUpperCase()}`}
            </h2>
            <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
              {meta.descBn}
            </p>
            <p role="status" className="mt-2 font-mono text-[11px] text-[var(--dashboard-text-muted)]">
              ব্যক্তিগত পরামর্শ এখনো লোড হয়নি — নিচের প্রম্পট দিয়ে শুরু করুন।
            </p>
          </>
        )}

        {contextChip && (
          <div className="mt-4 flex max-w-full items-center gap-1.5 rounded-full border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] px-3 py-1 text-xs text-[var(--dashboard-text-secondary)]">
            <PushPin className="h-3 w-3 flex-shrink-0 text-[var(--dashboard-primary)]" aria-hidden="true" />
            <span className="font-mono text-[var(--dashboard-primary)]">context</span>
            <span className="max-w-[220px] truncate">{contextChip}</span>
          </div>
        )}

        <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {starterPrompts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPrompt(p.prompt)}
              className="ai-chip group"
            >
              <FileText className="h-3 w-3" aria-hidden="true" />
              {p.labelBn}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
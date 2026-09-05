"use client";

// Discovery state for a fresh conversation: the mode's identity tile, honest
// capability line, an optional inbound context chip (e.g. launched from the
// Solver with a topic/question), and start-er prompt chips.

import { FileText, Pin } from "lucide-react";
import { PRESET_PROMPTS } from "@/lib/data/ai";
import { modeMeta } from "./modes";
import { QUICK_PROMPTS } from "./prompts";
import type { Mode } from "./modes";

type EmptyStateProps = {
  mode: Mode;
  contextChip: string | null;
  onPrompt: (prompt: string) => void;
};

export default function EmptyState({ mode, contextChip, onPrompt }: EmptyStateProps) {
  const meta = modeMeta(mode);
  const prompts =
    mode === "tutor"
      ? PRESET_PROMPTS.map((p) => ({ id: p.id, labelBn: p.label.bn, prompt: p.label.bn }))
      : QUICK_PROMPTS.filter((q) => q.category === mode).map((q) => ({
          id: q.labelBn,
          labelBn: q.labelBn,
          prompt: q.prompt,
        }));

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-4 py-8">
      <div className="flex max-w-xl flex-col items-center text-center">
        <div className="ai-avatar h-14 w-14" aria-hidden="true">
          <meta.icon className="h-6 w-6 text-[var(--ai-accent)]" />
        </div>

        <h2 className="mt-3 font-mono text-lg tracking-tight text-[var(--text-primary)]">
          {`${meta.labelBn} · ${meta.labelEn.toUpperCase()}`}
        </h2>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
          {meta.descBn}
        </p>

        {contextChip && (
          <div className="mt-4 flex max-w-full items-center gap-1.5 rounded-full border border-[var(--dashboard-border-muted)] bg-[var(--dashboard-surface-muted)] px-3 py-1 text-xs text-[var(--dashboard-text-secondary)]">
            <Pin className="h-3 w-3 flex-shrink-0 text-[var(--dashboard-primary)]" aria-hidden="true" />
            <span className="font-mono text-[var(--dashboard-primary)]">context</span>
            <span className="max-w-[220px] truncate">{contextChip}</span>
          </div>
        )}

        <div className="mt-6 flex max-w-xl flex-wrap justify-center gap-2">
          {prompts.map((p) => (
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
"use client";

import { paletteStates } from "@/lib/exam-calm";

/**
 * Phase 3 question palette — the #1 stress reducer (LMU 2025): free
 * backtracking. Jump to any question; answered/current/unseen at a glance.
 * Full keyboard access (buttons, aria-current, aria-label).
 */
export default function QuestionPalette({
  questionIds,
  answers,
  currentId,
  onJump,
}: {
  questionIds: number[];
  answers: Record<number, string>;
  currentId: number | null;
  onJump: (id: number) => void;
}) {
  if (questionIds.length === 0) return null;
  const states = paletteStates(questionIds, answers, currentId);

  return (
    <nav aria-label="Question palette — jump to any question" className="flex flex-wrap gap-1.5">
      {questionIds.map((id, i) => {
        const st = states[i];
        return (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            aria-label={`Question ${i + 1}${st === "answered" ? " — answered" : st === "current" ? " — current" : " — unseen"}`}
            aria-current={st === "current" ? "true" : undefined}
            className="flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-xs font-bold transition-colors hover:border-[var(--dashboard-primary)]"
            style={
              st === "current"
                ? { borderColor: "var(--dashboard-primary)", background: "var(--dashboard-primary-subtle)", color: "var(--dashboard-primary)" }
                : st === "answered"
                  ? { borderColor: "color-mix(in srgb, var(--dashboard-success) 40%, transparent)", background: "var(--dashboard-success-subtle)", color: "var(--dashboard-success)" }
                  : { borderColor: "var(--dashboard-border-muted)", background: "var(--dashboard-surface-muted)", color: "var(--dashboard-text-muted)" }
            }
          >
            {i + 1}
          </button>
        );
      })}
    </nav>
  );
}
